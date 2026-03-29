import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Network, Activity, Clock, ShieldAlert, HeartPulse, Map, Share2, AlertTriangle, Sun, Moon, PlusCircle, Link as LinkIconDuo, Trash2, Settings2, Play, RotateCcw, Pause, FastForward, Rewind, Bot, Layout, ChevronLeft, ChevronRight, GraduationCap, Loader2 } from 'lucide-react';
import { generateTopology, analyzeNetwork } from './ai_service';

function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle Theme">
      {theme === 'dark' ? <Sun size={24} color="#facc15" /> : <Moon size={24} color="#3b82f6" />}
    </button>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="glass-panel" style={{ marginBottom: '2rem' }}>
      <h2 className="section-title">
        <Icon size={28} color="var(--accent)" />
        {title}
      </h2>
      {children}
    </div>
  );
}

// Sandbox Constants & Utilities
const NODE_RADIUS = 25;
const COLLISION_DIST = 60; // minimum distance between nodes (50px diameter + 10px padding)

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function getOSPFFavoredTopology(w = 1000, h = 500) {
  const n0 = generateId(), n1 = generateId(), n2 = generateId(), n3 = generateId(), n4 = generateId(), n5 = generateId();
  return {
    nodes: [
      { id: n0, x: w * 0.2, y: h * 0.3, label: 'Core1' },
      { id: n1, x: w * 0.2, y: h * 0.7, label: 'Core2' },
      { id: n2, x: w * 0.5, y: h * 0.5, label: 'Hub' },
      { id: n3, x: w * 0.75, y: h * 0.3, label: 'Edge1' },
      { id: n4, x: w * 0.75, y: h * 0.7, label: 'Edge2' },
      { id: n5, x: w * 0.9, y: h * 0.5, label: 'Target' },
    ],
    links: [
      { id: generateId(), source: n0, target: n1, fails: false },
      { id: generateId(), source: n0, target: n2, fails: false },
      { id: generateId(), source: n1, target: n2, fails: false },
      { id: generateId(), source: n2, target: n3, fails: true },
      { id: generateId(), source: n2, target: n4, fails: false },
      { id: generateId(), source: n0, target: n3, fails: false },
      { id: generateId(), source: n1, target: n4, fails: false },
      { id: generateId(), source: n3, target: n5, fails: false },
      { id: generateId(), source: n4, target: n5, fails: false },
      { id: generateId(), source: n3, target: n4, fails: false },
    ]
  };
}

function getRIPFavoredTopology(w = 1000, h = 500) {
  const n0 = generateId(), n1 = generateId(), n2 = generateId(), n3 = generateId(), n4 = generateId(), n5 = generateId(), n6 = generateId();
  return {
    nodes: [
      { id: n0, x: w * 0.1, y: h * 0.5, label: 'R1' },
      { id: n1, x: w * 0.25, y: h * 0.3, label: 'R2' },
      { id: n2, x: w * 0.25, y: h * 0.7, label: 'R3' },
      { id: n3, x: w * 0.5, y: h * 0.5, label: 'R4' },
      { id: n4, x: w * 0.75, y: h * 0.3, label: 'R5' },
      { id: n5, x: w * 0.75, y: h * 0.7, label: 'R6' },
      { id: n6, x: w * 0.9, y: h * 0.5, label: 'R7' },
    ],
    links: [
      { id: generateId(), source: n0, target: n1, fails: false },
      { id: generateId(), source: n0, target: n2, fails: false },
      { id: generateId(), source: n1, target: n3, fails: true },
      { id: generateId(), source: n2, target: n3, fails: false },
      { id: generateId(), source: n3, target: n4, fails: false },
      { id: generateId(), source: n3, target: n5, fails: false },
      { id: generateId(), source: n4, target: n6, fails: false },
      { id: generateId(), source: n5, target: n6, fails: false },
    ]
  };
}

function Sandbox({ 
  nodes, setNodes, 
  links, setLinks, 
  protocol, setProtocol,
  onSimulationComplete 
}) {

  const [mode, setMode] = useState('idle'); // addNode, addLink, delete, failLink, idle
  const [simState, setSimState] = useState('idle'); // idle, calculating, ready

  const [selectedNodes, setSelectedNodes] = useState([]); // Array of node IDs
  const [selectionBox, setSelectionBox] = useState(null); // { x1, y1, x2, y2 }

  // Interaction State
  const [selectedNode, setSelectedNode] = useState(null); // Used for link connecting
  const [draggingNode, setDraggingNode] = useState(null);

  // Simulation Stats
  const [time, setTime] = useState(0);
  const [messages, setMessages] = useState(0);

  // Playback State
  const [simSteps, setSimSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const sandboxRef = useRef(null);
  const isLocked = simState === 'calculating' || simState === 'ready';

  // --- Collision Avoidance Helper ---
  const resolveCollision = useCallback((x, y, ignoreId = null, currentNodes = nodes) => {
    let finalX = x;
    let finalY = y;
    let collisionDetected = true;
    let attempts = 0;
    while (collisionDetected && attempts < 10) {
      collisionDetected = false;
      for (const n of currentNodes) {
        if (n.id === ignoreId) continue;
        const dist = Math.hypot(n.x - finalX, n.y - finalY);
        if (dist < COLLISION_DIST) {
          // Push it right and down a bit
          finalX += 30;
          finalY += 30;
          collisionDetected = true;
          break; // re-check all nodes with new coords
        }
      }
      attempts++;
    }
    // Constrain to sandbox bounds loosely (assuming 1000x500 ish)
    const bounds = sandboxRef.current?.getBoundingClientRect();
    if (bounds) {
      finalX = Math.max(NODE_RADIUS, Math.min(finalX, bounds.width - NODE_RADIUS));
      finalY = Math.max(NODE_RADIUS, Math.min(finalY, bounds.height - NODE_RADIUS));
    }
    return { x: finalX, y: finalY };
  }, [nodes]);

  // --- Toolbar Actions ---
  const handleGenerateOSPF = () => {
    if (isLocked) return;
    const { width, height } = sandboxRef.current?.getBoundingClientRect() || { width: 1000, height: 500 };
    const { nodes: sn, links: sl } = getOSPFFavoredTopology(width, height);
    setNodes(sn);
    setLinks(sl);
    setMode('idle');
    setSimState('idle');
    setTime(0);
    setMessages(0);
  };

  const handleGenerateRIP = () => {
    if (isLocked) return;
    const { width, height } = sandboxRef.current?.getBoundingClientRect() || { width: 1000, height: 500 };
    const { nodes: sn, links: sl } = getRIPFavoredTopology(width, height);
    setNodes(sn);
    setLinks(sl);
    setMode('idle');
    setSimState('idle');
    setTime(0);
    setMessages(0);
  };

  const handleClear = () => {
    if (isLocked) return;
    setNodes([]);
    setLinks([]);
    setMode('idle');
    setSimState('idle');
    setTime(0);
    setMessages(0);
    setSimSteps([]);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const setEditMode = (newMode) => {
    if (isLocked) return;
    setMode(mode === newMode ? 'idle' : newMode);
    setSelectedNode(null);
  };

  // --- Canvas Interaction ---
  const handleSandboxMouseDown = (e) => {
    if (isLocked || mode !== 'idle') return;
    if (e.target !== sandboxRef.current) return;

    const rect = sandboxRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setSelectionBox({ x1: x, y1: y, x2: x, y2: y });
    if (!e.ctrlKey) {
      setSelectedNodes([]);
    }
  };

  const handleSandboxClick = (e) => {
    if (isLocked) return;
    if (mode === 'addNode' && sandboxRef.current) {
      const rect = sandboxRef.current.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;

      const { x, y } = resolveCollision(rawX, rawY);

      const newNode = {
        id: generateId(),
        x,
        y,
        label: `R${nodes.length}`
      };
      setNodes([...nodes, newNode]);
    }
  };

  // --- Element Interaction ---
  const handleNodeClick = (e, targetNode) => {
    e.stopPropagation();
    if (isLocked) return;

    if (mode === 'delete') {
      const toDelete = selectedNodes.includes(targetNode.id) ? selectedNodes : [targetNode.id];
      setNodes(nodes.filter(n => !toDelete.includes(n.id)));
      setLinks(links.filter(l => !toDelete.includes(l.source) && !toDelete.includes(l.target)));
      setSelectedNodes([]);
    }
    else if (mode === 'addLink') {
      if (!selectedNode) {
        setSelectedNode(targetNode);
      } else {
        if (selectedNode.id !== targetNode.id) {
          // Check if link already exists
          const exists = links.some(l =>
            (l.source === selectedNode.id && l.target === targetNode.id) ||
            (l.source === targetNode.id && l.target === selectedNode.id)
          );
          if (!exists) {
            setLinks([...links, {
              id: generateId(),
              source: selectedNode.id,
              target: targetNode.id,
              fails: false
            }]);
          }
        }
        setSelectedNode(null); // reset selection
      }
    }
  };

  const handleLinkClick = (e, link) => {
    e.stopPropagation();
    if (isLocked) return;

    if (mode === 'delete') {
      setLinks(links.filter(l => l.id !== link.id));
    } else if (mode === 'failLink') {
      setLinks(links.map(l => l.id === link.id ? { ...l, fails: !l.fails } : l));
    }
  };

  // --- Drag & Drop & Selection ---
  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation();
    if (isLocked || mode !== 'idle') return;

    const isAlreadySelected = selectedNodes.includes(node.id);
    let currentSelection = [...selectedNodes];
    
    if (e.ctrlKey) {
      if (isAlreadySelected) {
        currentSelection = currentSelection.filter(id => id !== node.id);
      } else {
        currentSelection.push(node.id);
      }
      setSelectedNodes(currentSelection);
    } else {
      if (!isAlreadySelected) {
        currentSelection = [node.id];
        setSelectedNodes(currentSelection);
      }
      // If it IS already selected, we don't clear it yet, 
      // allowing the user to start a group drag.
    }

    // Capture state for the duration of the drag
    const rect = sandboxRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDraggingNode({
      mouseX,
      mouseY,
      initialPositions: nodes.reduce((acc, n) => {
        if (currentSelection.includes(n.id)) {
           acc[n.id] = { x: n.x, y: n.y };
        }
        return acc;
      }, {})
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!sandboxRef.current || isLocked) return;
      const rect = sandboxRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (draggingNode) {
        const dx = mouseX - draggingNode.mouseX;
        const dy = mouseY - draggingNode.mouseY;

        setNodes(prev => prev.map(n => {
          if (draggingNode.initialPositions[n.id]) {
            const newX = draggingNode.initialPositions[n.id].x + dx;
            const newY = draggingNode.initialPositions[n.id].y + dy;
            
            // Clamping
            const x = Math.max(NODE_RADIUS, Math.min(newX, rect.width - NODE_RADIUS));
            const y = Math.max(NODE_RADIUS, Math.min(newY, rect.height - NODE_RADIUS));
            return { ...n, x, y };
          }
          return n;
        }));
      } else if (selectionBox) {
        setSelectionBox(prev => ({ ...prev, x2: mouseX, y2: mouseY }));
        
        const xMin = Math.min(selectionBox.x1, mouseX);
        const xMax = Math.max(selectionBox.x1, mouseX);
        const yMin = Math.min(selectionBox.y1, mouseY);
        const yMax = Math.max(selectionBox.y1, mouseY);

        // This filter still needs 'nodes' but if we reference nodes here, 
        // the effects re-enters. We use a functional update on setSelectedNodes.
        setSelectedNodes(prevSelected => {
           // We can't access 'nodes' directly without triggering re-exec, 
           // but we need it for selection box. 
           // Using a tiny closure to get last nodes.
           const inBox = nodes.filter(n => 
             n.x >= xMin && n.x <= xMax && n.y >= yMin && n.y <= yMax
           ).map(n => n.id);
           
           if (e.ctrlKey) return Array.from(new Set([...prevSelected, ...inBox]));
           return inBox;
        });
      }
    };

    const handleMouseUp = (e) => {
      if (draggingNode) {
        const rect = sandboxRef.current.getBoundingClientRect();
        const startMouseX = draggingNode.mouseX;
        const startMouseY = draggingNode.mouseY;
        const endMouseX = e.clientX - rect.left;
        const endMouseY = e.clientY - rect.top;
        
        // If it was just a click (no drag), we update selection strictly
        if (Math.hypot(endMouseX - startMouseX, endMouseY - startMouseY) < 3 && !e.ctrlKey) {
           // Find which node we clicked? Actually simplest is to just rely on handleNodeMouseDown
           // But if we're here, we click-released.
        }
      }
      setDraggingNode(null);
      setSelectionBox(null);
    };

    if (draggingNode || selectionBox) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // Removed nodes from dependency to prevent re-registering listener on every pixel move
    // This is vital for performance.
  }, [draggingNode, selectionBox, isLocked, setNodes]);

  // --- Simulation Logic ---
  const runSimulation = () => {
    if (isLocked) return;
    if (nodes.length < 2 || links.length === 0) {
      alert("Please add at least 2 nodes and 1 link to run the simulation.");
      return;
    }

    setTime(0);
    setMessages(0);
    setSimState('calculating');
    setMode('idle');

    let steps = [];
    const activeLinks = links.filter(l => !l.fails);
    const failedLinks = links.filter(l => l.fails);

    let currentTime = 0;
    let currentMessages = 0;

    steps.push({
      message: protocol === 'OSPF' ? 'Initializing OSPF (Link-State)' : 'Initializing RIP (Distance Vector)',
      activeLinks: [],
      failedLinks: failedLinks.map(l => l.id),
      captions: {},
      time: 0,
      messages: 0
    });

    if (protocol === 'OSPF') {
      let visitedNodes = new Set();
      let queue = [nodes[0].id];
      let stepCount = 0;

      while (queue.length > 0 && stepCount < 20) {
        let current = queue.shift();
        visitedNodes.add(current);
        let relatedLinks = activeLinks.filter(l => l.source === current || l.target === current);
        let currentEdges = relatedLinks.map(l => l.id);

        currentTime += 2; // OSPF is fast
        currentMessages += relatedLinks.length * 2; // LSA flooding overhead

        steps.push({
          message: `Flooding LSA from Router ${nodes.find(n => n.id === current)?.label || current}`,
          activeLinks: currentEdges,
          failedLinks: failedLinks.map(l => l.id),
          captions: { [current]: 'Flooding LSA' },
          time: currentTime,
          messages: currentMessages
        });

        for (let link of relatedLinks) {
          let neighbor = link.source === current ? link.target : link.source;
          if (!visitedNodes.has(neighbor) && !queue.includes(neighbor)) {
            queue.push(neighbor);
          }
        }
        stepCount++;
      }

      currentTime += 5;
      steps.push({
        message: 'Network Converged (Dijkstra SPF Completed)',
        activeLinks: activeLinks.map(l => l.id),
        failedLinks: failedLinks.map(l => l.id),
        captions: nodes.reduce((acc, n) => ({ ...acc, [n.id]: 'Table Built' }), {}),
        time: currentTime,
        messages: currentMessages
      });

    } else {
      const iterations = nodes.length; // max hops
      for (let i = 1; i < iterations; i++) {
        let captions = {};
        let active = [];

        currentTime += 15; // RIP is slow
        currentMessages += nodes.length * activeLinks.length; // Periodic full table swap

        for (let j = 0; j < nodes.length; j += 2) {
          if (j + (i % 2) < nodes.length) {
            let n = nodes[j + (i % 2)];
            captions[n.id] = `Iter ${i}: Exchanging Table`;
            let relatedLinks = activeLinks.filter(l => l.source === n.id || l.target === n.id);
            active = active.concat(relatedLinks.map(l => l.id));
          }
        }

        steps.push({
          message: `RIP Bellman-Ford Iteration ${i}`,
          activeLinks: active,
          failedLinks: failedLinks.map(l => l.id),
          captions: captions,
          time: currentTime,
          messages: currentMessages
        });
      }

      currentTime += 10;
      steps.push({
        message: 'Network Converged (Bellman-Ford Settled)',
        activeLinks: activeLinks.map(l => l.id),
        failedLinks: failedLinks.map(l => l.id),
        captions: nodes.reduce((acc, n) => ({ ...acc, [n.id]: 'Routes Installed' }), {}),
        time: currentTime,
        messages: currentMessages
      });
    }

    setSimSteps(steps);
    setCurrentStep(0);
    setIsPlaying(true);
    setSimState('ready');
  };

  const cancelSimulation = () => {
    setSimState('idle');
    setIsPlaying(false);
    setSimSteps([]);
    setCurrentStep(0);
  };

  const togglePlay = () => setIsPlaying(!isPlaying);

  useEffect(() => {
    let interval;
    if (simState === 'ready' && isPlaying && currentStep < simSteps.length - 1) {
      const baseInterval = 1500;
      interval = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= simSteps.length - 2) {
            setIsPlaying(false);
            return simSteps.length - 1;
          }
          return prev + 1;
        });
      }, baseInterval / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [simState, isPlaying, currentStep, simSteps.length, playbackSpeed]);

  // Sync stats with current step
  useEffect(() => {
    if (simSteps[currentStep]) {
      setTime(simSteps[currentStep].time || 0);
      setMessages(simSteps[currentStep].messages || 0);

      // Trigger Audit when simulation finishes
      if (currentStep === simSteps.length - 1 && simSteps.length > 0 && onSimulationComplete) {
        onSimulationComplete({
          nodes,
          links,
          protocol,
          time: simSteps[currentStep].time,
          messages: simSteps[currentStep].messages
        });
      }
    }
  }, [currentStep, simSteps, nodes, links, protocol, onSimulationComplete]);


  // Helper to map links to coordinates
  const getSimulatedLinks = () => {
    return links.map(link => {
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);
      if (!sourceNode || !targetNode) return null;
      return { ...link, sourceNode, targetNode };
    }).filter(Boolean);
  };

  return (
    <div className="simulation-container">
      <Section title="Interactive Topology Sandbox" icon={Share2}>
        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
          Construct your own Smart City network. Add routers, draw connections, and simulate failures to observe how Distance Vector versus Link-State algorithms converge differently based on graph complexity (O(E log V) vs. O(V × E)).
        </p>

        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-group">
            <button
              className={`btn-tool ${mode === 'addNode' ? 'active' : ''}`}
              onClick={() => setEditMode('addNode')} disabled={isLocked}
              title="Click canvas to add a new router node."
            >
              <PlusCircle size={18} /> Add Node
            </button>
            <button
              className={`btn-tool ${mode === 'addLink' ? 'active' : ''}`}
              onClick={() => setEditMode('addLink')} disabled={isLocked}
              title="Click two nodes consecutively to connect them."
            >
              <LinkIconDuo size={18} /> Connect Nodes
            </button>
            <button
              className={`btn-tool ${mode === 'delete' ? 'active' : ''}`}
              onClick={() => setEditMode('delete')} disabled={isLocked}
              title="Click a node or link to permanently delete it."
            >
              <Trash2 size={18} /> Delete Element
            </button>
            <button
              className={`btn-tool ${mode === 'failLink' ? 'active' : ''}`}
              onClick={() => setEditMode('failLink')} disabled={isLocked}
              title="Click a link to toggle it as a 'Failed' link during simulation."
            >
              <AlertTriangle size={18} color={mode === 'failLink' ? '#ef4444' : 'currentColor'} /> Select Failures
            </button>
          </div>

          <div className="toolbar-group">
            <button className="btn-tool" onClick={handleGenerateOSPF} disabled={isLocked} title="Load a dense mesh graph favoring OSPF (Link-State) rapid calculations.">
              OSPF Sample
            </button>
            <button className="btn-tool" onClick={handleGenerateRIP} disabled={isLocked} title="Load a sparse linear graph favoring RIP (Distance Vector) scaling.">
              RIP Sample
            </button>
            <button className="btn-tool" style={{ color: '#ef4444' }} onClick={handleClear} disabled={isLocked} title="Erase the current topology.">
              Clear Sandbox
            </button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select
              value={protocol}
              onChange={e => setProtocol(e.target.value)}
              disabled={isLocked}
              style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="OSPF">OSPF (Link-State)</option>
              <option value="RIP">RIP (Distance Vector)</option>
            </select>

            {simState === 'ready' ? (
              <>
                <div className="playback-controls" style={{ display: 'flex', gap: '0.25rem' }}>
                  <button className="btn-tool" onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>
                    <Rewind size={16} />
                  </button>
                  <button className="btn-tool" onClick={togglePlay} disabled={currentStep === simSteps.length - 1}>
                    {isPlaying ? <Pause size={16} /> : <Play size={16} fill={currentStep === simSteps.length - 1 ? 'none' : 'currentColor'} />}
                  </button>
                  <button className="btn-tool" onClick={() => setCurrentStep(Math.min(simSteps.length - 1, currentStep + 1))} disabled={currentStep === simSteps.length - 1}>
                    <FastForward size={16} />
                  </button>
                  <div className="speed-slider" style={{ marginLeft: '1rem' }}>
                    <span style={{ minWidth: '35px', display: 'inline-block' }}>{playbackSpeed}x</span>
                    <input
                      type="range"
                      min="0.25"
                      max="2"
                      step="0.25"
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    />
                  </div>
                </div>
                <button className="btn" onClick={cancelSimulation} style={{ backgroundColor: '#f59e0b', marginLeft: '1rem' }}>
                  <RotateCcw size={16} /> Reset
                </button>
              </>
            ) : (
              <button className="btn" onClick={runSimulation} disabled={nodes.length < 2 || links.length === 0 || simState === 'calculating'}>
                <Play size={16} fill="currentColor" /> {simState === 'calculating' ? 'Calculating...' : 'Run Algorithm'}
              </button>
            )}
          </div>
        </div>

        <div
          ref={sandboxRef}
          className={`network-sandbox ${mode === 'addNode' ? 'adding' : mode === 'addLink' ? 'linking' : mode === 'delete' ? 'deleting' : mode === 'failLink' ? 'failing' : ''} ${draggingNode ? 'dragging' : ''} ${selectionBox ? 'selecting' : ''}`}
          onClick={handleSandboxClick}
          onMouseDown={handleSandboxMouseDown}
        >
          {selectionBox && (
            <div 
              style={{
                position: 'absolute',
                left: Math.min(selectionBox.x1, selectionBox.x2),
                top: Math.min(selectionBox.y1, selectionBox.y2),
                width: Math.abs(selectionBox.x2 - selectionBox.x1),
                height: Math.abs(selectionBox.y2 - selectionBox.y1),
                backgroundColor: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid var(--accent)',
                zIndex: 100,
                pointerEvents: 'none'
              }}
            />
          )}

          {/* Edge/Link Renderer */}
          <svg style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, zIndex: 1, pointerEvents: 'none' }}>
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {getSimulatedLinks().map((link) => {
              const currentStepData = simSteps[currentStep];
              const isFailedLink = currentStepData ? currentStepData.failedLinks.includes(link.id) : link.fails;
              const isCurrentlyFailing = isFailedLink && (simState === 'failed' || simState === 'ready' || simState === 'calculating');
              const isActive = currentStepData ? currentStepData.activeLinks.includes(link.id) : false;
              const isDone = currentStepData && currentStep === simSteps.length - 1;

              return (
                <g key={link.id} pointerEvents="stroke" onClick={(e) => handleLinkClick(e, link)} className={`link ${isCurrentlyFailing ? 'failed' : ''} ${isLocked ? 'locked' : ''}`}>
                  <line
                    x1={link.sourceNode.x} y1={link.sourceNode.y} x2={link.targetNode.x} y2={link.targetNode.y}
                    stroke="transparent" strokeWidth="15"
                  />
                  <line
                    x1={link.sourceNode.x} y1={link.sourceNode.y} x2={link.targetNode.x} y2={link.targetNode.y}
                    stroke={isCurrentlyFailing ? '#ef4444' : ((isActive || (isDone && !isFailedLink)) ? 'var(--link-active)' : 'var(--link-color)')}
                    strokeWidth={isCurrentlyFailing ? 2 : (isActive ? 6 : 4)}
                    filter={((isDone && !isCurrentlyFailing) || isCurrentlyFailing || isActive) ? "url(#glow)" : ""}
                  />
                  {link.fails && !isDone && (
                    <circle cx={(link.sourceNode.x + link.targetNode.x) / 2} cy={(link.sourceNode.y + link.targetNode.y) / 2} r="8" fill="#ef4444" opacity={simState === 'ready' ? 1 : 0.6} />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Node Renderer */}
          {nodes.map((node) => {
            const isSelectedLink = selectedNode?.id === node.id && mode === 'addLink';
            const isSelected = selectedNodes.includes(node.id);
            const currentStepData = simSteps[currentStep];
            const nodeCaption = currentStepData?.captions?.[node.id];
            const isDone = currentStepData && currentStep === simSteps.length - 1;

            return (
              <div
                key={node.id}
                className={`node ${isSelectedLink ? 'selected' : ''} ${isSelected ? 'active' : ''} ${(nodeCaption || isDone) ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                style={{ left: node.x, top: node.y }}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => handleNodeClick(e, node)}
                title={node.label}
              >
                {node.label}
                {nodeCaption && <div className="node-caption">{nodeCaption}</div>}
              </div>
            );
          })}

          {/* Execution Overlay Messages */}
          {simState === 'ready' && simSteps[currentStep] && (
            <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: currentStep === simSteps.length - 1 ? 'var(--link-active)' : 'rgba(0,0,0,0.7)', color: 'white', padding: '10px 20px', borderRadius: '8px', zIndex: 100, display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: currentStep === simSteps.length - 1 ? 'bold' : 'normal' }}>
              {isPlaying && currentStep < simSteps.length - 1 && <Settings2 className="spin" />} {simSteps[currentStep].message}
            </div>
          )}
        </div>

        {/* Dynamic Topology Stats */}
        <div className="simulation-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginTop: '1rem' }}>
          <div className="stat-box">
            <div className="stat-label">Nodes (V)</div>
            <div className="stat-value" style={{ color: 'var(--text-primary)' }}>{nodes.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Edges (E)</div>
            <div className="stat-value" style={{ color: 'var(--text-primary)' }}>{links.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Convergence Time</div>
            <div className="stat-value">{time}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Control Messages</div>
            <div className="stat-value">{messages}</div>
          </div>
        </div>
      </Section>
    </div>
  );
}


function App() {
  const [theme, setTheme] = useState('dark');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Network State (Lifted from Sandbox)
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [protocol, setProtocol] = useState('OSPF');

  // AI State
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [auditError, setAuditError] = useState(null);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    setAiError(null);
    try {
      const topology = await generateTopology(aiPrompt);
      if (topology.nodes && topology.links) {
        setNodes(topology.nodes);
        setLinks(topology.links);
        setAiPrompt("");
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSimulationComplete = async (data) => {
    setIsAiAnalyzing(true);
    setAiAnalysis(null);
    setAuditError(null);
    try {
      const analysis = await analyzeNetwork(data);
      setAiAnalysis(analysis);
    } catch (err) {
      setAuditError("Audit failed: " + err.message);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="app-container">
      <header className="header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "bold", fontSize: "1.25rem", color: "var(--accent)" }}>
          <Network size={28} />
          SmartCity NetLab
        </div>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
           <a href="https://github.com" target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)", display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', fontSize: '0.9rem' }}>
              <Activity size={18} /> Source
           </a>
           <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
        </div>
      </header>

      <div className="layout-root">
        {/* Left Sidebar: Knowledge Hub */}
        <aside className={`sidebar ${!leftOpen ? 'collapsed' : ''}`}>
           <div style={{ padding: '2rem' }}>
              <Section title="The Challenge" icon={Activity}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  Smart City networks operate at a scale and traffic intensity far exceeding conventional enterprise grids. They require extreme sensitivity to delay and high dynamic mobility.
                </p>
              </Section>

              <Section title="Social Impact" icon={HeartPulse}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="glass-panel" style={{ padding: '1rem', marginBottom: 0 }}>
                    <ShieldAlert size={20} color="#ef4444" />
                    <h5 style={{ margin: '0.5rem 0' }}>Public Safety</h5>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ensuring reliability for first responder alerts.</p>
                  </div>
                  <div className="glass-panel" style={{ padding: '1rem', marginBottom: 0 }}>
                    <Map size={20} color="#10b981" />
                    <h5 style={{ margin: '0.5rem 0' }}>Urban Mobility</h5>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Real-time traffic orchestration.</p>
                  </div>
                </div>
              </Section>

              <Section title="Resource Library" icon={GraduationCap}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                   <div className="glass-panel resource-card" style={{ padding: '0.75rem', marginBottom: 0 }}>
                      <div className="resource-header">
                         <span className="badge">BOOK</span>
                         <span className="resource-year">1976</span>
                      </div>
                      <h4 style={{ margin: '0.25rem 0', fontSize: '0.8rem' }}>Queueing Systems</h4>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>L. Kleinrock - The foundation of packet switching.</p>
                      <a href="https://dl.acm.org/doi/book/10.5555/539611" target="_blank" rel="noreferrer" className="resource-link">View Repository</a>
                   </div>

                   <div className="glass-panel resource-card" style={{ padding: '0.75rem', marginBottom: 0 }}>
                      <div className="resource-header">
                         <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>RFC</span>
                         <span className="resource-year">1998</span>
                      </div>
                      <h4 style={{ margin: '0.25rem 0', fontSize: '0.8rem' }}>OSPF Version 2</h4>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>RFC 2328 - Link-state routing architecture.</p>
                      <a href="https://datatracker.ietf.org/doc/html/rfc2328" target="_blank" rel="noreferrer" className="resource-link">Read Standard</a>
                   </div>

                   <div className="glass-panel resource-card" style={{ padding: '0.75rem', marginBottom: 0 }}>
                      <div className="resource-header">
                         <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>CASE STUDY</span>
                         <span className="resource-year">2022</span>
                      </div>
                      <h4 style={{ margin: '0.25rem 0', fontSize: '0.8rem' }}>Urban Networking</h4>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Barcelona Smart City - Real-time mesh grid deployment.</p>
                      <a href="https://www.barcelona.cat/en/" target="_blank" rel="noreferrer" className="resource-link">Case Analysis</a>
                   </div>

                   <div className="glass-panel resource-card" style={{ padding: '0.75rem', marginBottom: 0 }}>
                      <div className="resource-header">
                         <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>LECTURE</span>
                         <span className="resource-year">STW</span>
                      </div>
                      <h4 style={{ margin: '0.25rem 0', fontSize: '0.8rem' }}>Graph Theory in Nets</h4>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Visualizing Bellman-Ford vs Dijkstra's complexity.</p>
                      <a href="https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-16-dijkstra/" target="_blank" rel="noreferrer" className="resource-link">MIT OpenCourse</a>
                   </div>
                </div>
              </Section>
           </div>
        </aside>

        {/* Center: Operation & Simulation Zone */}
        <main className="main-content">
          <div className="hero">
            <h1>Network Layer Dynamics</h1>
            <p style={{ fontSize: '1rem', opacity: 0.8 }}>Autonomous Path Selection & Data Plane Efficiency</p>
          </div>

          <Sandbox 
            nodes={nodes} setNodes={setNodes} 
            links={links} setLinks={setLinks}
            protocol={protocol} setProtocol={setProtocol}
            onSimulationComplete={handleSimulationComplete}
          />

          <div style={{ marginTop: '2rem' }}>
            <Section title="Strategic Analysis" icon={Clock}>
              <div className="grid-2">
                <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent)' }}>
                  <h4>Link-State (OSPF)</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Optimal for high-density metropolitan mesh networks with frequent topology shifts.</p>
                </div>
                <div className="glass-panel" style={{ borderLeft: '4px solid #10B981' }}>
                  <h4>Distance Vector (RIP)</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Suited for localized edge subnets where computational overhead is a constraint.</p>
                </div>
              </div>
            </Section>
          </div>
        </main>

        {/* Right Sidebar: AI Intelligence */}
        <aside className={`sidebar right ${!rightOpen ? 'collapsed' : ''}`}>
           <div style={{ padding: '2rem' }}>
              <Section title="AI Architect" icon={Bot}>
                 <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Describe the desired network constraints.</p>
                 <textarea 
                    placeholder="e.g. Generate a redundant star topology for a city center with 6 routers..."
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    style={{ width: '100%', height: '120px', padding: '1rem', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid var(--border-color)', fontSize: '0.875rem', resize: 'none' }}
                 />
                 {aiError && (
                   <div style={{ marginTop: '0.5rem', color: '#ef4444', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                     <AlertTriangle size={12} inline style={{ marginRight: '0.25rem' }} /> {aiError}
                   </div>
                 )}
                 <button 
                  className="btn" 
                  onClick={handleAiGenerate}
                  disabled={isAiGenerating}
                  style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
                 >
                    {isAiGenerating ? <Loader2 className="spin" size={18} /> : "Generate Topology"}
                 </button>
              </Section>

              <Section title="NetAudit AI" icon={Layout}>
                 <div className="glass-panel" style={{ fontSize: '0.875rem', borderLeft: '3px solid var(--accent)', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', marginBottom: '0.5rem' }}>
                       {isAiAnalyzing ? <Loader2 className="spin" size={16} /> : <Activity size={16} />} 
                       Status: {isAiAnalyzing ? 'Analyzing...' : (aiAnalysis ? 'Audit Complete' : (auditError ? 'Error' : 'Idle'))}
                    </div>
                    <p style={{ color: auditError ? '#ef4444' : 'var(--text-secondary)', fontStyle: (aiAnalysis || auditError) ? 'normal' : 'italic', fontSize: '0.8rem' }}>
                       {auditError || aiAnalysis || "Provide a topology to start automated comparative analysis using LLM reasoning."}
                    </p>
                 </div>
              </Section>
           </div>
        </aside>

        {/* Floating Toggles */}
        <button className="sidebar-toggle left" onClick={() => setLeftOpen(!leftOpen)} title={leftOpen ? "Close Knowledge Hub" : "Open Knowledge Hub"}>
           {leftOpen ? <ChevronLeft /> : <GraduationCap />}
        </button>
        <button className="sidebar-toggle right" onClick={() => setRightOpen(!rightOpen)} title={rightOpen ? "Close AI Intelligence" : "Open AI Intelligence"}>
           {rightOpen ? <ChevronRight /> : <Bot />}
        </button>
      </div>
    </div>
  );
}

export default App;
