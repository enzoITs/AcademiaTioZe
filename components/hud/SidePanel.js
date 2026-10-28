'use client';
import { useGame } from '../../hooks/useGame.js';
import { setTab, getSuggestions } from '../../game/engine/store.js';
import ShopPanel from '../shop/ShopPanel.js';
import AcademyPanel from './AcademyPanel.js';
import FinancePanel from '../reports/FinancePanel.js';
import StudentsPanel from '../students/StudentsPanel.js';
import MessagesPanel from './MessagesPanel.js';
import StaffPanel from '../staff/StaffPanel.js';
import Icon from '../ui/Icon.js';

const TABS = [
  { id: 'shop', label: 'Loja', icon: 'cart', Panel: ShopPanel },
  { id: 'academy', label: 'Academia', icon: 'bulb', Panel: AcademyPanel },
  { id: 'finance', label: 'Finanças', icon: 'chart', Panel: FinancePanel },
  { id: 'students', label: 'Alunos', icon: 'users', Panel: StudentsPanel },
  { id: 'staff', label: 'Equipe', icon: 'broom', Panel: StaffPanel },
  { id: 'mural', label: 'Mural', icon: 'mail', Panel: MessagesPanel },
];

export default function SidePanel() {
  const { ui, rt, state } = useGame();
  const s = getSuggestions();
  const academyBadge = rt.academy.brokenItems.length + rt.academy.unreachableItems.length + (s.missing.filter((m) => m.essentialCount).length ? 1 : 0);
  const active = TABS.find((t) => t.id === ui.tab) ?? TABS[0];
  const Panel = active.Panel;
  return (
    <aside className="side-panel">
      <nav className="tabs" role="tablist" aria-label="Painéis">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={ui.tab === t.id}
            aria-controls="side-panel-body"
            className={`tab ${ui.tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={17} />
            <span>{t.label}</span>
            {t.id === 'academy' && academyBadge ? <span className="tab-badge">{academyBadge}</span> : null}
            {t.id === 'mural' && state.messages.length ? <span className="tab-dot" /> : null}
          </button>
        ))}
      </nav>
      <div id="side-panel-body" className="panel-body" role="tabpanel" aria-labelledby={`tab-${active.id}`}>
        <Panel />
      </div>
    </aside>
  );
}
