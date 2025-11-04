import { useState } from 'react'
import './SliderRankingPage.css'
import { Slider } from '@mui/material'
import { GraphVisualization } from './GraphVisualization'
import { useGRC20 } from './useGRC20'
import type { 
  ItemEntity, 
  RankListEntity, 
  KnowledgeGraph, 
  PropertyGraph,
  PropertyGraphEntity,
  PropertyGraphRelation
} from './types'

interface SliderRankingPageProps {
  rankListEntity: RankListEntity
  initialItems: ItemEntity[]
  onBack: () => void
}

export function SliderRankingPage({ rankListEntity, initialItems, onBack }: SliderRankingPageProps) {
  // Track scores for each item (1-100 scale)
  const [itemScores, setItemScores] = useState<Map<string, number>>(new Map())
  
  // Track which items are ranked (in the ranking area)
  const [rankedItemIds, setRankedItemIds] = useState<Set<string>>(new Set())
  
  // Track which item is currently being adjusted (to prevent re-sorting while sliding)
  const [activeSliderItemId, setActiveSliderItemId] = useState<string | null>(null)
  
  // Track sorted order - only update when slider is released
  const [sortedItemOrder, setSortedItemOrder] = useState<string[]>([])
  
  const [draggedItem, setDraggedItem] = useState<ItemEntity | null>(null)
  const [showGraphViz, setShowGraphViz] = useState(false)
  const [showPublishModal, setShowPublishModal] = useState(false)

  // GRC-20 integration
  const {
    isPreparing,
    preparedData,
    prepareStatus,
    prepareGRC20Edits,
    resetPreparedData,
  } = useGRC20()

  // Build knowledge graph from current scores
  const buildGraph = (): KnowledgeGraph => {
    const relations = []
    
    for (const itemId of rankedItemIds) {
      const score = itemScores.get(itemId)
      if (score !== undefined) {
        relations.push({
          id: crypto.randomUUID(),
          from: rankListEntity.id,
          to: itemId,
          score: score,
        })
      }
    }

    return {
      entities: [rankListEntity, ...initialItems],
      relations,
    }
  }

  const handleDragStart = (item: ItemEntity) => {
    setDraggedItem(item)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropToRanked = () => {
    if (!draggedItem) return

    // Add to ranked area if not already there
    if (!rankedItemIds.has(draggedItem.id)) {
      const newRankedIds = new Set([...rankedItemIds, draggedItem.id])
      setRankedItemIds(newRankedIds)
      
      // Set score to lowest current score (or 1 if no items ranked)
      const newScores = new Map(itemScores)
      if (!itemScores.has(draggedItem.id)) {
        // Find minimum score among ranked items
        const existingScores = Array.from(itemScores.values())
        const minScore = existingScores.length > 0 ? Math.min(...existingScores) : 1
        newScores.set(draggedItem.id, minScore)
        setItemScores(newScores)
      }
      
      // Update sorted order
      updateSortedOrder(newRankedIds, newScores)
    }
    
    setDraggedItem(null)
  }

  const handleDropToUnranked = () => {
    if (!draggedItem) return

    // Remove from ranked area
    const newRankedIds = new Set(rankedItemIds)
    newRankedIds.delete(draggedItem.id)
    setRankedItemIds(newRankedIds)
    
    // Remove score
    const newScores = new Map(itemScores)
    newScores.delete(draggedItem.id)
    setItemScores(newScores)
    
    // Update sorted order
    updateSortedOrder(newRankedIds, newScores)
    
    setDraggedItem(null)
  }

  const handleScoreChange = (itemId: string, value: number) => {
    setItemScores(new Map(itemScores.set(itemId, value)))
  }

  const handleSliderChangeStart = (itemId: string) => {
    setActiveSliderItemId(itemId)
  }

  const handleSliderChangeEnd = () => {
    setActiveSliderItemId(null)
    // Re-sort after slider is released
    updateSortedOrder(rankedItemIds, itemScores)
  }

  // Helper function to update the sorted order based on scores
  const updateSortedOrder = (rankedIds: Set<string>, scores: Map<string, number>) => {
    const items = initialItems.filter(item => rankedIds.has(item.id))
    const sorted = items.sort((a, b) => {
      const scoreA = scores.get(a.id) || 50
      const scoreB = scores.get(b.id) || 50
      return scoreB - scoreA
    })
    setSortedItemOrder(sorted.map(item => item.id))
  }

  const handleReset = () => {
    setItemScores(new Map())
    setRankedItemIds(new Set())
  }

  const getRankedCount = () => {
    return rankedItemIds.size
  }

  const getRankedItems = (): ItemEntity[] => {
    return initialItems.filter(item => rankedItemIds.has(item.id))
  }

  const getUnrankedItems = (): ItemEntity[] => {
    return initialItems.filter(item => !rankedItemIds.has(item.id))
  }

  const convertToPropertyGraph = (): PropertyGraph => {
    const graph = buildGraph()
    
    const propertyEntities: PropertyGraphEntity[] = graph.entities.map(entity => {
      if ('rank_type' in entity && entity.rank_type === 'weighted_rank') {
        return {
          id: entity.id,
          properties: {
            name: entity.name,
            rank_type: entity.rank_type,
          },
        }
      } else if ('emoji' in entity) {
        return {
          id: entity.id,
          properties: {
            name: entity.name,
          },
        }
      }
      return { id: entity.id, properties: {} }
    })

    const propertyRelations: PropertyGraphRelation[] = graph.relations.map(relation => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      properties: {
        score: relation.score,
      },
    }))

    return {
      entities: propertyEntities,
      relations: propertyRelations,
    }
  }

  const exportGraph = () => {
    const propertyGraph = convertToPropertyGraph()
    console.log('📊 Property Graph:', propertyGraph)
    setShowGraphViz(true)
  }

  const downloadGraphJSON = () => {
    const propertyGraph = convertToPropertyGraph()
    const dataStr = JSON.stringify(propertyGraph, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'slider-ranking-graph.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handlePrepareClick = () => {
    if (getRankedCount() === 0) {
      alert('Please rank some items before preparing!')
      return
    }
    setShowPublishModal(true)
    handlePrepare()
  }

  const handlePrepare = async () => {
    try {
      const propertyGraph = convertToPropertyGraph()
      await prepareGRC20Edits(propertyGraph, {
        title: rankListEntity?.name,
        description: `Slider ranking (1-100) with ${getRankedCount()} ranked items`,
      })
    } catch (error: any) {
      console.error('Prepare error:', error)
      alert(error.message || 'Failed to prepare GRC-20 edits')
    }
  }

  const downloadGRC20Edits = () => {
    if (!preparedData) return

    const dataStr = JSON.stringify(preparedData.edit, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'grc20-edits.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const graph = buildGraph()
  const rankedCount = getRankedCount()
  const rankedItems = getRankedItems()
  const unrankedItems = getUnrankedItems()

  // Use the stable sorted order (only updated when slider is released)
  const sortedRankedItems = activeSliderItemId
    ? // While sliding, use current stable order
      sortedItemOrder.map(id => initialItems.find(item => item.id === id)!).filter(Boolean)
    : // When not sliding, get fresh sorted list
      rankedItems.sort((a, b) => {
        const scoreA = itemScores.get(a.id) || 50
        const scoreB = itemScores.get(b.id) || 50
        return scoreB - scoreA
      })

  return (
    <div className="app slider-ranking-page">
      <div className="header">
        <div className="header-left">
          <button className="back-button" onClick={onBack}>
            ← Back
          </button>
          <h1>🎚️ {rankListEntity.name}</h1>
          <span className="mode-badge">Slider Mode</span>
        </div>
        <div className="header-actions">
          <button className="publish-button" onClick={handlePrepareClick}>
            ⚙️ Prepare GRC-20 Edits
          </button>
          <button className="export-button" onClick={exportGraph}>
            View Graph
          </button>
          <button className="reset-button" onClick={handleReset}>
            Reset All
          </button>
        </div>
      </div>

      <div className="graph-info">
        <div className="graph-stat">
          <strong>Total Items:</strong> {initialItems.length}
        </div>
        <div className="graph-stat">
          <strong>Items Ranked:</strong> {rankedCount}
        </div>
        <div className="graph-stat">
          <strong>Relations:</strong> {graph.relations.length}
        </div>
      </div>

      <div className="slider-ranking-content">
        <div className="ranking-instructions">
          <h2>Drag & Drop with Slider Scoring</h2>
          <p>Drag items to the ranking area, then use sliders to rate from 1-100. Higher scores = better ranking.</p>
        </div>

        <div className="ranked-area-section">
          <h3>🎚️ Ranked Items</h3>
          <div
            className={`ranked-area ${draggedItem ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDrop={handleDropToRanked}
          >
            {sortedRankedItems.length === 0 && (
              <div className="empty-message">Drag items here to rank them</div>
            )}
            {sortedRankedItems.map(item => {
              const score = itemScores.get(item.id) || 50
              
              return (
                <div
                  key={item.id}
                  className="ranked-item"
                  draggable
                  onDragStart={() => handleDragStart(item)}
                >
                  <div 
                    className="item-info"
                  >
                    <span className="item-emoji">{item.emoji}</span>
                    <span className="item-name">{item.name}</span>
                  </div>
                  <div 
                    className="slider-wrapper"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <span className="slider-label">1</span>
                    <Slider
                      value={score}
                      onChange={(_, newValue) => handleScoreChange(item.id, newValue as number)}
                      onChangeCommitted={() => handleSliderChangeEnd()}
                      onMouseDown={() => handleSliderChangeStart(item.id)}
                      onTouchStart={() => handleSliderChangeStart(item.id)}
                      min={1}
                      max={100}
                      step={0.01}
                      valueLabelDisplay="auto"
                      sx={{
                        flex: 1,
                        color: '#667eea',
                        '& .MuiSlider-thumb': {
                          width: 24,
                          height: 24,
                        },
                        '& .MuiSlider-track': {
                          height: 8,
                        },
                        '& .MuiSlider-rail': {
                          height: 8,
                          opacity: 0.3,
                        },
                        '& .MuiSlider-mark': {
                          display: 'none',
                        },
                      }}
                    />
                    <span className="slider-label">100</span>
                    <div 
                      className="score-badge"
                    >
                      {score}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="unranked-section">
          <h3>Unranked Items</h3>
          <div
            className={`unranked-pool ${draggedItem ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDrop={handleDropToUnranked}
          >
            {unrankedItems.length === 0 && (
              <div className="empty-message">All items ranked!</div>
            )}
            {unrankedItems.map(item => (
              <div
                key={item.id}
                className="item"
                draggable
                onDragStart={() => handleDragStart(item)}
              >
                <span className="item-emoji">{item.emoji}</span>
                <span className="item-label">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graph Visualization Modal */}
      {showGraphViz && (
        <div className="modal-overlay" onClick={() => setShowGraphViz(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 Knowledge Graph Visualization</h2>
              <button className="close-button" onClick={() => setShowGraphViz(false)}>
                ✕
              </button>
            </div>
            
            <div className="graph-viz-container">
              <GraphVisualization 
                graph={graph} 
                rankListEntity={rankListEntity}
                tierMetadata={[]} // No preset tiers in slider mode
              />
              
              {graph.relations.length === 0 && (
                <div className="no-relations-overlay">
                  No items scored yet. Drag items and use sliders to create relations!
                </div>
              )}
            </div>

            <div className="graph-stats">
              <div className="stat-box">
                <div className="stat-label">Total Entities</div>
                <div className="stat-value">{graph.entities.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Total Relations</div>
                <div className="stat-value">{graph.relations.length}</div>
              </div>
              <div className="stat-box">
                <div className="stat-label">Items Ranked</div>
                <div className="stat-value">{rankedCount} / {initialItems.length}</div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="download-button" onClick={downloadGraphJSON}>
                📥 Download JSON
              </button>
              <button className="close-modal-button" onClick={() => setShowGraphViz(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GRC-20 Edits Modal */}
      {showPublishModal && (
        <div className="modal-overlay" onClick={() => { setShowPublishModal(false); resetPreparedData(); }}>
          <div className="modal-content publish-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚙️ GRC-20 Edits</h2>
              <button className="close-button" onClick={() => { setShowPublishModal(false); resetPreparedData(); }}>
                ✕
              </button>
            </div>

            <div className="publish-modal-body">
              {isPreparing ? (
                <div className="wallet-connection">
                  <div className="wallet-icon">⚙️</div>
                  <h3>Preparing GRC-20 Edits...</h3>
                  <p>Converting your ranking graph to GRC-20 operations</p>
                </div>
              ) : preparedData ? (
                <div className="publish-content">
                  <div className="prepare-success">
                    <div className="success-icon">✅</div>
                    <h3>GRC-20 Edits Ready!</h3>
                    <p>Your ranking has been successfully encoded as GRC-20 operations</p>
                  </div>

                  <div className="publish-summary">
                    <h3>Edit Summary</h3>
                    <div className="summary-item">
                      <strong>Edit Name:</strong> {preparedData.edit.name}
                    </div>
                    <div className="summary-item">
                      <strong>Total Operations:</strong> {preparedData.summary.totalOps}
                    </div>
                    <div className="summary-item">
                      <strong>Entity Operations:</strong> {preparedData.summary.entityOps}
                    </div>
                    <div className="summary-item">
                      <strong>Property Operations:</strong> {preparedData.summary.propertyOps}
                    </div>
                    <div className="summary-item">
                      <strong>Relation Operations:</strong> {preparedData.summary.relationOps}
                    </div>
                  </div>

                  <div className="ops-preview">
                    <h4>Operations Preview</h4>
                    <div className="ops-code">
                      <pre>{JSON.stringify(preparedData.edit, null, 2).slice(0, 500)}...</pre>
                    </div>
                  </div>

                  {prepareStatus.status !== 'idle' && (
                    <div className={`publish-status ${prepareStatus.status}`}>
                      {prepareStatus.status === 'success' && '✅'}
                      {prepareStatus.status === 'error' && '❌'}
                      {prepareStatus.message}
                    </div>
                  )}

                  <div className="publish-actions">
                    <button 
                      className="download-grc20-button" 
                      onClick={downloadGRC20Edits}
                    >
                      💾 Download GRC-20 Edits
                    </button>
                    <button 
                      className="done-button" 
                      onClick={() => { setShowPublishModal(false); resetPreparedData(); }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="wallet-connection">
                  <div className="wallet-icon">❌</div>
                  <h3>Failed to Prepare Edits</h3>
                  <p>{prepareStatus.message || 'An error occurred'}</p>
                  <button 
                    className="connect-wallet-button" 
                    onClick={handlePrepare}
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

