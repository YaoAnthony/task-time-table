import React, { useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { message } from 'antd';
import {
  useGetGameShopQuery,
  usePurchaseGameShopItemMutation,
  type GameShopItem,
} from '../../../../../api/profileStateRtkApi';
import type { GameScene } from '../GameScene';

interface GameShopModalProps {
  open: boolean;
  roomId?: string | null;
  sceneRef: RefObject<GameScene | null>;
  onClose: () => void;
}

const categoryLabels: Record<GameShopItem['category'] | 'all', string> = {
  all: 'All',
  npc: 'NPC',
  house: 'Houses',
  storage: 'Storage',
  tool: 'Tools',
  pet: 'Pets',
};

const categoryAccent: Record<GameShopItem['category'], string> = {
  npc: '#7abf7a',
  house: '#d69b28',
  storage: '#b77a42',
  tool: '#6e8ee8',
  pet: '#d9a066',
};

export const GameShopModal: React.FC<GameShopModalProps> = ({ open, roomId, sceneRef, onClose }) => {
  const [category, setCategory] = useState<GameShopItem['category'] | 'all'>('all');
  const { data, isLoading, refetch } = useGetGameShopQuery(roomId ?? undefined, { skip: !open });
  const [purchaseGameShopItem, { isLoading: purchasing }] = usePurchaseGameShopItemMutation();
  const coins = Number(data?.wallet?.coins ?? 0);

  const items = useMemo(() => {
    const raw = data?.items ?? [];
    return category === 'all' ? raw : raw.filter((item) => item.category === category);
  }, [category, data?.items]);

  if (!open) return null;

  const handlePurchase = async (item: GameShopItem) => {
    try {
      const result = await purchaseGameShopItem({
        shopItemId: item.shopItemId,
        quantity: 1,
        roomId: roomId ?? data?.gameSave?.worldStatus?.roomId,
      }).unwrap();
      if (result.gameSave) {
        sceneRef.current?.syncEventSaveData(result.gameSave);
        sceneRef.current?.loadHouseGameSaveData(result.gameSave);
        sceneRef.current?.loadStorageChestGameSaveData(result.gameSave);
      }
      if (item.category === 'npc') {
        const purchase = result.purchase as { alreadyOwned?: boolean; pendingArrival?: boolean } | undefined;
        if (purchase?.alreadyOwned) message.info(`${item.name ?? item.title} already lives here.`);
        else if (purchase?.pendingArrival) message.success(`${item.name ?? item.title} is on the bus.`);
        else message.success(`${item.name ?? item.title} joined.`);
      } else if (item.category === 'house') {
        message.success('House blueprint added to backpack.');
      } else if (item.category === 'storage') {
        message.success('Storage chest added to backpack.');
      } else if (item.category === 'pet') {
        message.success(`${item.nameZh || item.name || item.title || item.id} added to backpack.`);
      } else {
        message.success(`${item.nameZh || item.name || item.title || item.id} added to backpack.`);
      }
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || 'Purchase failed');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game shop"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 440,
        background: 'rgba(7, 10, 12, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        fontFamily: '"Courier New", monospace',
      }}
    >
      <section
        style={{
          width: 'min(980px, 94vw)',
          maxHeight: '82vh',
          overflow: 'hidden',
          border: '2px solid var(--px-border-gold)',
          borderRadius: 6,
          background: 'var(--px-surface)',
          boxShadow: '0 10px 0 rgba(0,0,0,0.35), 0 18px 42px rgba(0,0,0,0.45)',
          display: 'grid',
          gridTemplateRows: 'auto auto 1fr',
        }}
      >
        <header
          style={{
            padding: '14px 16px',
            borderBottom: '2px solid var(--px-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: 'var(--px-gold)', fontSize: 20, letterSpacing: 0 }}>Game Shop</h2>
            <p style={{ margin: '5px 0 0', color: 'var(--px-muted)', fontSize: 12 }}>
              Buy villagers, house blueprints, placeable storage, pets, and tools.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ color: 'var(--px-gold)', whiteSpace: 'nowrap' }}>{coins.toLocaleString()} coins</strong>
            <button type="button" onClick={onClose} style={{
              border: '2px solid var(--px-border)',
              borderRadius: 4,
              background: 'var(--px-surface2)',
              color: 'var(--px-text)',
              minWidth: 36,
              minHeight: 34,
              cursor: 'pointer',
              fontWeight: 900,
            }}>X</button>
          </div>
        </header>

        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--px-border)' }}>
          {(['all', 'npc', 'house', 'storage', 'pet', 'tool'] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setCategory(entry)}
              style={{
                minHeight: 32,
                border: `2px solid ${category === entry ? 'var(--px-border-gold)' : 'var(--px-border)'}`,
                borderRadius: 4,
                background: category === entry ? 'rgba(255,215,0,0.12)' : 'var(--px-surface2)',
                color: category === entry ? 'var(--px-gold)' : 'var(--px-text)',
                padding: '4px 12px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {categoryLabels[entry]}
            </button>
          ))}
        </div>

        <div style={{ overflow: 'auto', padding: 16 }}>
          {isLoading ? (
            <div style={{ color: 'var(--px-muted)', padding: 16 }}>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {items.map((item) => {
                const accent = categoryAccent[item.category];
                const owned = Boolean(item.owned);
                const pending = Boolean(item.pendingArrival);
                const canBuy = !owned && !pending && coins >= item.price;
                const disabled = purchasing || owned || pending || !canBuy;
                const title = item.nameZh || item.name || item.title || item.id;
                const status = owned ? 'Owned' : pending ? 'On the way' : `${item.price} coins`;
                const ownedCount = item.ownedQuantity ?? item.ownedBlueprintQuantity;

                return (
                  <article key={item.shopItemId} style={{
                    border: `2px solid ${owned || pending ? accent : 'var(--px-border)'}`,
                    borderRadius: 6,
                    background: 'var(--px-surface2)',
                    padding: 14,
                    display: 'grid',
                    gap: 10,
                    minHeight: 170,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ color: accent, fontSize: 12, fontWeight: 900 }}>{categoryLabels[item.category]}</div>
                        <h3 style={{ margin: '4px 0 0', color: 'var(--px-text)', fontSize: 18, letterSpacing: 0 }}>{title}</h3>
                      </div>
                      <span style={{ color: accent, fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }}>{status}</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--px-muted)', fontSize: 13, lineHeight: 1.55 }}>
                      {item.description || (item.category === 'storage' ? `Capacity ${item.capacity ?? 24}` : item.category === 'tool' ? 'Tool item.' : item.category === 'pet' ? 'Pet companion.' : '')}
                    </p>
                    {ownedCount != null && (
                      <div style={{ color: 'var(--px-muted)', fontSize: 12 }}>Backpack: {ownedCount}</div>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handlePurchase(item)}
                      style={{
                        alignSelf: 'end',
                        minHeight: 36,
                        border: `2px solid ${accent}`,
                        borderRadius: 4,
                        background: canBuy ? 'rgba(255,215,0,0.12)' : 'rgba(0,0,0,0.08)',
                        color: canBuy ? accent : 'var(--px-muted)',
                        fontWeight: 900,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {owned ? 'Owned' : pending ? 'Waiting' : canBuy ? 'Buy' : 'Not enough coins'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
