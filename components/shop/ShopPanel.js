'use client';
import { useState } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG, PROFILES, profilesForEra } from '../../game/config.js';
import { formatMoney } from '../../game/utils/format.js';
import { startPlacement, setShopFilter, getSuggestions, catalogEntries } from '../../game/engine/store.js';
import { mostRequestedTypes, isTypeLocked } from '../../game/systems/suggestions.js';
import EquipmentThumb from '../equipment/EquipmentThumb.js';
import Icon from '../ui/Icon.js';

const FILTERS = [['all', 'Tudo'], ...Object.entries(CONFIG.categories).map(([id, c]) => [id, c.label])];

function attractedProfiles(type, era) {
  return profilesForEra(era).filter((p) => PROFILES[p].essentials.includes(type) || PROFILES[p].desired.includes(type))
    .map((p) => ({ id: p, essential: PROFILES[p].essentials.includes(type) }));
}

function ShopCard({ entry, money, reputation, requested, era }) {
  const [tierId, setTierId] = useState(entry.tiers[0].id);
  const tier = entry.tiers.find((t) => t.id === tierId);
  const tierCfg = CONFIG.tiers[tier.id];
  const lockedEra = (entry.minEra ?? 1) > era;
  const lockedType = isTypeLocked(entry.type, reputation, era);
  const lockedTier = (tier.minRep ?? 0) > reputation;
  const locked = lockedType || lockedTier;
  const needRep = Math.max(entry.minRep ?? 0, tier.minRep ?? 0);
  const affordable = money >= tier.price;
  const [w, h] = entry.size;
  const attracts = attractedProfiles(entry.type, era);

  return (
    <article className={`shop-card ${locked ? 'locked' : ''}`}>
      {requested && !locked ? <span className="badge badge-hot">Muito pedido</span> : null}
      <div className="shop-thumb"><EquipmentThumb type={entry.type} tier={tier.id} size={56} /></div>
      <div className="shop-info">
        <h3>{entry.name}</h3>
        <p className="shop-meta">
          <span>{CONFIG.categories[entry.category].label}</span>
          <span>{w}×{h} tiles</span>
          <span>{tier.capacity > 0 ? `Cap. ${tier.capacity}/bloco` : `Vibe +${entry.vibe}`}</span>
        </p>
        <p className="shop-desc">{entry.description}</p>
        {tier.capacity > 0 ? (
          <p className="shop-meta subtle">
            Condição inicial {tierCfg.startCondition} · teto {tierCfg.ceiling} · desgaste {tierCfg.wearPerUse}/uso
          </p>
        ) : null}
        {attracts.length ? (
          <p className="shop-attracts">
            {attracts.map((a) => (
              <span key={a.id} className={`chip chip-${a.id}`} title={a.essential ? 'Essencial' : 'Desejado'}>
                {PROFILES[a.id].label}{a.essential ? ' ★' : ''}
              </span>
            ))}
          </p>
        ) : null}
        {entry.tiers.length > 1 ? (
          <div className="tier-picker" role="radiogroup" aria-label="Nível de qualidade">
            {entry.tiers.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={t.id === tierId}
                className={`tier-btn ${t.id === tierId ? 'active' : ''}`}
                onClick={() => setTierId(t.id)}
              >
                {CONFIG.tiers[t.id].label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="shop-buy">
        <span className={`price ${affordable ? '' : 'short'}`}>{formatMoney(tier.price)}</span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={locked || !affordable}
          onClick={() => startPlacement(entry.type, tier.id)}
          title={lockedEra ? `Chega na Era ${entry.minEra}` : locked ? `Requer ${needRep} estrelas` : affordable ? 'Comprar e posicionar' : 'Saldo insuficiente'}
        >
          {lockedEra ? <><Icon name="lock" size={14} /> Era {entry.minEra}</> : locked ? <><Icon name="lock" size={14} /> {needRep}★</> : 'Comprar'}
        </button>
      </div>
    </article>
  );
}

export default function ShopPanel() {
  const { state, ui } = useGame();
  const requested = mostRequestedTypes(getSuggestions());
  const entries = catalogEntries().filter((e) => ui.shopFilter === 'all' || e.category === ui.shopFilter);
  const sorted = [...entries].sort((a, b) => Number(requested.has(b.type)) - Number(requested.has(a.type)));

  return (
    <section className="panel-section" aria-label="Loja">
      <div className="filters" role="tablist" aria-label="Categorias">
        {FILTERS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={ui.shopFilter === id}
            className={`filter ${ui.shopFilter === id ? 'active' : ''}`}
            onClick={() => setShopFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? <p className="empty">Nenhum item nesta categoria ainda.</p> : null}
      <div className="shop-list">
        {sorted.map((entry) => (
          <ShopCard key={entry.type} entry={entry} money={state.money} reputation={state.reputation} requested={requested.has(entry.type)} era={state.era} />
        ))}
      </div>
      <p className="hint">Itens com ★ são essenciais para o perfil. Itens travados liberam com reputação.</p>
    </section>
  );
}
