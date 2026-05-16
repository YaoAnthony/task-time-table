import React from 'react';
import { message } from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  useGetGameNpcShopQuery,
  usePurchaseGameNpcMutation,
  type GameNpcShopItem,
} from '../../../../api/profileStateRtkApi';

const roleLabels: Record<string, string> = {
  starter: '初始村民',
  farmer: '农夫',
  carpenter: '木匠',
  merchant: '商人',
  scholar: '学者',
  rancher: '牧场工',
};

const roleAccent: Record<string, string> = {
  starter: '#7abf7a',
  farmer: '#75b84d',
  carpenter: '#b77a42',
  merchant: '#d69b28',
  scholar: '#6e8ee8',
  rancher: '#d783a3',
};

const panelStyle: React.CSSProperties = {
  border: '2px solid var(--px-border)',
  borderRadius: 6,
  background: 'var(--px-surface)',
  boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
};

function getNpcStatus(npc: GameNpcShopItem) {
  if (npc.owned) {
    return {
      label: '已加入',
      button: '已拥有',
      disabled: true,
    };
  }
  if (npc.pendingArrival) {
    return {
      label: '巴士在路上',
      button: '等待到站',
      disabled: true,
    };
  }
  return {
    label: `${npc.price} 金币`,
    button: '招募',
    disabled: false,
  };
}

function NpcCard({
  npc,
  coins,
  purchasing,
  onPurchase,
}: {
  npc: GameNpcShopItem;
  coins: number;
  purchasing: boolean;
  onPurchase: (npc: GameNpcShopItem) => void;
}) {
  const accent = roleAccent[npc.role] ?? '#c89f45';
  const status = getNpcStatus(npc);
  const canBuy = !status.disabled && coins >= npc.price;
  const disabled = status.disabled || purchasing || !canBuy;

  return (
    <article
      style={{
        ...panelStyle,
        padding: 16,
        display: 'grid',
        gap: 12,
        minHeight: 220,
        borderColor: npc.owned || npc.pendingArrival ? accent : 'var(--px-border)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: accent, fontSize: 12, fontWeight: 800, marginBottom: 5 }}>
            {roleLabels[npc.role] ?? npc.title}
          </div>
          <h2 style={{ margin: 0, fontSize: 21, color: 'var(--px-text)' }}>{npc.name}</h2>
          <p style={{ margin: '6px 0 0', color: 'var(--px-muted)', fontSize: 13 }}>{npc.title}</p>
        </div>
        <span
          style={{
            border: `1px solid ${accent}`,
            color: accent,
            borderRadius: 4,
            padding: '4px 7px',
            fontSize: 12,
            fontWeight: 800,
            whiteSpace: 'nowrap',
          }}
        >
          {status.label}
        </span>
      </div>

      <p style={{ margin: 0, color: 'var(--px-text)', fontSize: 14, lineHeight: 1.6 }}>
        {npc.description}
      </p>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onPurchase(npc)}
        style={{
          alignSelf: 'end',
          minHeight: 38,
          border: `2px solid ${npc.owned ? 'var(--px-border)' : accent}`,
          borderRadius: 4,
          background: npc.owned || npc.pendingArrival
            ? 'var(--px-surface2)'
            : canBuy
              ? 'rgba(255,215,0,0.12)'
              : 'rgba(0,0,0,0.08)',
          color: npc.owned || npc.pendingArrival ? 'var(--px-muted)' : canBuy ? accent : 'var(--px-muted)',
          fontWeight: 800,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {canBuy || status.disabled ? status.button : '金币不足'}
      </button>
    </article>
  );
}

const GameNpcShop: React.FC = () => {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useGetGameNpcShopQuery();
  const [purchaseGameNpc, { isLoading: purchasing }] = usePurchaseGameNpcMutation();
  const coins = Number(data?.wallet?.coins ?? 0);
  const npcs = data?.npcs ?? [];

  const handlePurchase = async (npc: GameNpcShopItem) => {
    try {
      const result = await purchaseGameNpc({
        npcId: npc.id,
        roomId: data?.gameSave?.worldStatus?.roomId,
      }).unwrap();
      if (result.pendingArrival) {
        message.success(`${npc.name} 已经上车，回游戏等巴士到站。`);
      } else if (result.alreadyOwned) {
        message.info(`${npc.name} 已经在村子里。`);
      } else {
        message.success(`${npc.name} 已加入村子。`);
      }
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '招募失败');
    }
  };

  return (
    <div
      style={{
        minHeight: '100%',
        padding: 24,
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
      }}
    >
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, color: 'var(--px-gold)', letterSpacing: 0 }}>NPC 商店</h1>
            <p style={{ margin: '7px 0 0', color: 'var(--px-muted)', fontSize: 13 }}>
              用金币招募村民。购买后会排入车站事件，回到挂机培养后等巴士到站。
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <strong style={{ color: 'var(--px-gold)', whiteSpace: 'nowrap' }}>{coins.toLocaleString()} 金币</strong>
            <button
              type="button"
              onClick={() => navigate('/dashboard/idle-game')}
              style={{
                border: '2px solid var(--px-border-gold)',
                borderRadius: 4,
                background: 'var(--px-surface2)',
                color: 'var(--px-gold)',
                padding: '9px 14px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              回到游戏
            </button>
          </div>
        </header>

        {isLoading ? (
          <section style={{ ...panelStyle, padding: 22 }}>加载中...</section>
        ) : (
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {npcs.map((npc) => (
              <NpcCard
                key={npc.id}
                npc={npc}
                coins={coins}
                purchasing={purchasing}
                onPurchase={handlePurchase}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default GameNpcShop;
