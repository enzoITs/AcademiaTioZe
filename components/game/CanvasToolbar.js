'use client';
import { useGame } from '../../hooks/useGame.js';
import {
  toggleEditMode, toggleMaintenanceView, undo, repairAllBroken, openExpansions, zoneStatuses, openCityMap, viewMatriz, openDecor,
} from '../../game/engine/store.js';
import { lotCost } from '../../game/systems/network.js';
import { repairCost } from '../../game/systems/maintenance.js';
import { formatMoney } from '../../game/utils/format.js';
import Icon from '../ui/Icon.js';

export default function CanvasToolbar({ rendererRef }) {
  const { ui, state, rt } = useGame();
  const zoom = (f) => {
    const r = rendererRef.current;
    if (r) r.zoomAt(r.viewport.w / 2, r.viewport.h / 2, f);
  };
  const zones = zoneStatuses();
  const forSale = zones.filter((z) => z.status !== 'owned').length;
  const available = zones.filter((z) => z.status === 'available').length;
  const broken = rt.academy.brokenItems;
  const brokenCost = broken.reduce((s, i) => s + repairCost(i), 0);

  const camera = (
    <div className="toolbar toolbar-right" role="toolbar" aria-label="Câmera">
      <button type="button" className="tool icon-only" onClick={() => zoom(1.2)} aria-label="Aproximar"><Icon name="zoomIn" /></button>
      <button type="button" className="tool icon-only" onClick={() => zoom(1 / 1.2)} aria-label="Afastar"><Icon name="zoomOut" /></button>
      <button type="button" className="tool icon-only" onClick={() => rendererRef.current?.resetCamera()} aria-label="Enquadrar"><Icon name="fit" /></button>
    </div>
  );

  // Visitando uma filial: só dá para voltar, abrir o mapa e mexer na câmera.
  if (ui.view?.kind === 'branch') {
    return (
      <>
        <div className="toolbar toolbar-left" role="toolbar" aria-label="Visita à filial">
          <button type="button" className="tool" onClick={viewMatriz} title="Voltar para a Matriz (Esc)">
            <Icon name="door" /><span>Voltar à Matriz</span>
          </button>
          <button type="button" className="tool tool-map" onClick={openCityMap} title="Mapa da cidade: filiais da rede">
            <Icon name="map" /><span>Mapa da cidade</span>
          </button>
        </div>
        {camera}
      </>
    );
  }

  return (
    <>
      <div className="toolbar toolbar-left" role="toolbar" aria-label="Ferramentas">
        <button type="button" className={`tool ${ui.editMode ? 'active' : ''}`} onClick={toggleEditMode} aria-pressed={ui.editMode} title="Modo edição (E): mover, girar e vender">
          <Icon name="edit" /><span>Editar</span>
        </button>
        <button type="button" className={`tool ${ui.maintenanceView ? 'active' : ''}`} onClick={toggleMaintenanceView} aria-pressed={ui.maintenanceView} title="Visão de manutenção (M)">
          <Icon name="wrench" /><span>Manutenção</span>
        </button>
        {state.network ? (
          <button type="button" className="tool tool-map" onClick={openCityMap} title="Mapa da cidade: filiais da rede">
            <Icon name="map" /><span>Mapa da cidade</span>
            {state.network.lots.some((l) => state.money >= lotCost(state, l)) ? <span className="tool-badge">!</span> : null}
          </button>
        ) : null}
        <button type="button" className="tool" onClick={openDecor} title="Reforma: cor do chão e das paredes">
          <Icon name="paint" /><span>Reforma</span>
        </button>
        {forSale > 0 ? (
          <button type="button" className="tool" onClick={openExpansions} title="Comprar mais espaço para a academia">
            <Icon name="expand" /><span>Ampliar</span>
            {available > 0 ? <span className="tool-badge">{available}</span> : null}
          </button>
        ) : null}
        {ui.editMode || state.undo.length ? (
          <button type="button" className="tool" onClick={undo} disabled={!state.undo.length} title="Desfazer (Ctrl+Z). Vale só para ações de hoje">
            <Icon name="undo" /><span>Desfazer{state.undo.length ? ` (${state.undo.length})` : ''}</span>
          </button>
        ) : null}
        {broken.length ? (
          <button type="button" className="tool tool-alert" onClick={repairAllBroken} disabled={state.money < brokenCost} title="Consertar todos os quebrados">
            <Icon name="wrench" /><span>Consertar {broken.length} ({formatMoney(brokenCost)})</span>
          </button>
        ) : null}
      </div>
      {camera}
      {ui.maintenanceView ? (
        <div className="legend" aria-label="Legenda da manutenção">
          <span><i style={{ background: '#7cc98a' }} />Ok</span>
          <span><i style={{ background: '#f2cd5c' }} />Rangendo</span>
          <span><i style={{ background: '#f29a5c' }} />Cansado</span>
          <span><i style={{ background: '#e8646a' }} />Quebrado</span>
          <span><i className="ring" />Sujeira ({state.dirt.length})</span>
        </div>
      ) : null}
    </>
  );
}
