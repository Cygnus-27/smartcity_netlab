import React, { useState, useEffect, useRef } from 'react';
import { Network, Activity, Clock, ShieldAlert, HeartPulse, Map, Share2, AlertTriangle, Sun, Moon, PlusCircle, Link as LinkIconDuo, Trash2, Settings2, Play, RotateCcw, Pause, FastForward, Rewind } from 'lucide-react';

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

function getOSPFFavoredTopology() {
  const n0 = generateId(), n1 = generateId(), n2 = generateId(), n3 = generateId(), n4 = generateId(), n5 = generateId();
  return {
    nodes: [
      { id: n0, x: 200, y: 150, label: 'Core1' },
      { id: n1, x: 200, y: 350, label: 'Core2' },
      { id: n2, x: 450, y: 250, label: 'Hub' },
      { id: n3, x: 700, y: 150, label: 'Edge1' },
      { id: n4, x: 700, y: 350, label: 'Edge2' },
      { id: n5, x: 850, y: 250, label: 'Target' },
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

function getRIPFavoredTopology() {
  const n0 = generateId(), n1 = generateId(), n2 = generateId(), n3 = generateId(), n4 = generateId(), n5 = generateId(), n6 = generateId();
  return {
    nodes: [
      { id: n0, x: 100, y: 250, label: 'R1' },
      { id: n1, x: 300, y: 150, label: 'R2' },
      { id: n2, x: 300, y: 350, label: 'R3' },
      { id: n3, x: 500, y: 250, label: 'R4' },
      { id: n4, x: 700, y: 150, label: 'R5' },
      { id: n5, x: 700, y: 350, label: 'R6' },
      { id: n6, x: 900, y: 250, label: 'R7' },
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

function Sandbox() {
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);

  const [mode, setMode] = useState('idle'); // addNode, addLink, delete, failLink, idle
  const [simState, setSimState] = useState('idle'); // idle, calculating, ready
  const [protocol, setProtocol] = useState('OSPF');

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
  const resolveCollision = (x, y, ignoreId = null, currentNodes = nodes) => {
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
  };

  // --- Toolbar Actions ---
  const handleGenerateOSPF = () => {
    if (isLocked) return;
    const { nodes: sn, links: sl } = getOSPFFavoredTopology();
    setNodes(sn);
    setLinks(sl);
    setMode('idle');
    setSimState('idle');
    setTime(0);
    setMessages(0);
  };

  const handleGenerateRIP = () => {
    if (isLocked) return;
    const { nodes: sn, links: sl } = getRIPFavoredTopology();
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
      setNodes(nodes.filter(n => n.id !== targetNode.id));
      setLinks(links.filter(l => l.source !== targetNode.id && l.target !== targetNode.id));
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

  // --- Drag & Drop ---
  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation();
    if (isLocked || mode !== 'idle') return;

    // Calculate offset from node center to mouse cursor
    const rect = sandboxRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setDraggingNode({
      id: node.id,
      offsetX: mouseX - node.x,
      offsetY: mouseY - node.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingNode || !sandboxRef.current || isLocked) return;
      const rect = sandboxRef.current.getBoundingClientRect();
      const rawX = e.clientX - rect.left - draggingNode.offsetX;
      const rawY = e.clientY - rect.top - draggingNode.offsetY;

      // We don't resolve collision on EVERY pixel move to prevent jitter, just clamp
      const bounds = sandboxRef.current.getBoundingClientRect();
      const x = Math.max(NODE_RADIUS, Math.min(rawX, bounds.width - NODE_RADIUS));
      const y = Math.max(NODE_RADIUS, Math.min(rawY, bounds.height - NODE_RADIUS));

      setNodes(prev => prev.map(n => n.id === draggingNode.id ? { ...n, x, y } : n));
    };

    const handleMouseUp = () => {
      if (draggingNode && !isLocked) {
        // Enforce collision detection when dropping
        setNodes(prev => {
          const target = prev.find(n => n.id === draggingNode.id);
          if (!target) return prev;
          const { x, y } = resolveCollision(target.x, target.y, target.id, prev);
          return prev.map(n => n.id === draggingNode.id ? { ...n, x, y } : n);
        });
        setDraggingNode(null);
      }
    };

    if (draggingNode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNode, isLocked]);

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
    }
  }, [currentStep, simSteps]);


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

        {/* Sandbox Canvas */}
        <div
          ref={sandboxRef}
          className={`network-sandbox ${mode === 'addNode' ? 'adding' : mode === 'addLink' ? 'linking' : mode === 'delete' ? 'deleting' : mode === 'failLink' ? 'failing' : ''}`}
          onClick={handleSandboxClick}
        >
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
            const isSelected = selectedNode?.id === node.id && mode === 'addLink';
            const currentStepData = simSteps[currentStep];
            const nodeCaption = currentStepData?.captions?.[node.id];
            const isDone = currentStepData && currentStep === simSteps.length - 1;

            return (
              <div
                key={node.id}
                className={`node ${isSelected ? 'selected' : ''} ${(nodeCaption || isDone) ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="app-container">
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', fontSize: '1.25rem', color: 'var(--accent)' }}>
          <Network size={28} />
          SmartCity NetLab
        </div>
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
      </header>

      <main>
        <div className="hero">
          <h1>Network Layer Dynamics</h1>
          <p>Autonomous Path Selection & Data Plane Efficiency in Modern Smart City Infrastructures</p>
        </div>

        <Section title="The Challenge in Smart Cities" icon={Activity}>
          <div className="grid-2">
            <div>
              <h3>Traditional Constraints</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                Traditional routing protocols like RIP and OSPF were designed for conventional enterprise networks. Smart City networks, however, operate at a much larger scale, with high dynamic mobility, traffic intensity, and extreme sensitivity to delay.
              </p>
            </div>
            <div>
              <h3>Core Areas of Investigation</h3>
              <ul className="styled-list">
                <li><strong>Convergence Behavior:</strong> "Count-to-Infinity" via Bellman-Ford vs Link-State flooding.</li>
                <li><strong>Scalability:</strong> Managing routing tables as networks grow to O(N).</li>
                <li><strong>Protocol Overhead:</strong> Bandwidth consumption of periodic vs triggered updates.</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section title="Social Impact & Utility" icon={HeartPulse}>
          <div className="grid-3">
            <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-primary)' }}>
              <ShieldAlert size={32} color="#ef4444" style={{ marginBottom: '1rem' }} />
              <h4>Public Safety</h4>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                Minimizing convergence ensures high-priority alerts reach first responders without delay.
              </p>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-primary)' }}>
              <HeartPulse size={32} color="var(--accent)" style={{ marginBottom: '1rem' }} />
              <h4>Healthcare Telemetry</h4>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                Reliable routing maintains the integrity of remote patient telemetry where low packet loss is critical.
              </p>
            </div>
            <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-primary)' }}>
              <Map size={32} color="#10b981" style={{ marginBottom: '1rem' }} />
              <h4>Urban Mobility</h4>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                Efficient path selection prevents latency in traffic coordination, reducing congestion.
              </p>
            </div>
          </div>
        </Section>

        <Sandbox />

        <Section title="Expected Outcomes" icon={Clock}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Based on the comparative analysis within simulation environments (e.g., Packet Tracer, NS3), the data supports distinct deployment recommendations based on the target scale and complexity of the Smart City layer.
          </p>
          <div className="grid-2">
            <div className="glass-panel" style={{ borderLeft: '4px solid var(--accent)' }}>
              <h3>Link-State (OSPF)</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Performs optimally in large-scale networks with high traffic loads and frequent topology changes due to rapid convergence and loop-free operation via Dijkstra's SPF.</p>
            </div>
            <div className="glass-panel" style={{ borderLeft: '4px solid #10B981' }}>
              <h3>Distance Vector (RIP)</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Better suited for localized, low-complexity edge networks where computational resource conservation is more critical than sub-second convergence.</p>
            </div>
          </div>
        </Section>
      </main>

      <footer>
        <p>Comparative Performance Evaluation Method &copy; 2026</p>
        <p style={{ marginTop: '0.5rem' }}>Analyzing Convergence, Packet Delivery, Delay, and Overhead</p>
      </footer>
    </div>
  );
}

export default App;
