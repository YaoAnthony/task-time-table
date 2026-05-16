import React from 'react';
import type { RefObject } from 'react';
import { message } from 'antd';
import {
  useGetGameHouseShopQuery,
  usePurchaseGameHouseMutation,
  type GameHouseShopItem,
} from '../../../../../api/profileStateRtkApi';
import type { GameScene } from '../GameScene';

interface HouseShopModalProps {
  open: boolean;
  roomId?: string | null;
  sceneRef: RefObject<GameScene | null>;
  onClose: () => void;
}

export const HouseShopModal: React.FC<HouseShopModalProps> = ({ open, roomId, sceneRef, onClose }) => {
  const { data, isLoading, refetch } = useGetGameHouseShopQuery(roomId ?? undefined, { skip: !open });
  const [purchaseGameHouse, { isLoading: purchasing }] = usePurchaseGameHouseMutation();
  const coins = Number(data?.wallet?.coins ?? 0);
  const items = data?.items ?? [];

  if (!open) return null;

  const handlePurchase = async (item: GameHouseShopItem) => {
    try {
      const result = await purchaseGameHouse({
        houseDefinitionId: item.id,
        quantity: 1,
        roomId,
      }).unwrap();
      sceneRef.current?.loadHouseGameSaveData(result.gameSave);
      message.success('温室蓝图已经放进背包。');
      refetch();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '购买房屋蓝图失败');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="房屋商店"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 430,
        background: 'rgba(7, 10, 12, 0.55)',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        fontFamily: '"Courier New", monospace',
      }}
    >
      <section style={{
        width: 'min(760px, 94vw)',
        maxHeight: '82vh',
        overflow: 'hidden',
        border: '2px solid var(--px-border-gold)',
        borderRadius: 6,
        background: 'var(--px-surface)',
        boxShadow: '0 10px 0 rgba(0,0,0,0.35), 0 18px 42px rgba(0,0,0,0.45)',
      }}>
        <header style={{
          padding: '14px 16px',
          borderBottom: '2px solid var(--px-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}>
          <div>
            <h2 style={{ margin: 0, color: 'var(--px-gold)', fontSize: 20 }}>商店</h2>
            <p style={{ margin: '5px 0 0', color: 'var(--px-muted)', fontSize: 12 }}>
              买蓝图后选择热栏，按 F 在面前空地放置。
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ color: 'var(--px-gold)', whiteSpace: 'nowrap' }}>{coins.toLocaleString()} 金币</strong>
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

        <div style={{ padding: 16 }}>
          {isLoading ? (
            <div style={{ color: 'var(--px-muted)', padding: 16 }}>加载中...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {items.map((item) => {
                const canBuy = coins >= item.price;
                return (
                  <article key={item.id} style={{
                    border: '2px solid var(--px-border)',
                    borderRadius: 6,
                    background: 'var(--px-surface2)',
                    padding: 14,
                    display: 'grid',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <h3 style={{ margin: 0, color: 'var(--px-text)', fontSize: 18 }}>{item.nameZh}</h3>
                      <span style={{ color: 'var(--px-gold)', fontSize: 12, fontWeight: 900 }}>
                        {item.price} 金币
                      </span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--px-muted)', fontSize: 13, lineHeight: 1.55 }}>
                      每日租金 {item.rentPerDay}，蓝图库存 {item.ownedBlueprintQuantity ?? 0}
                    </p>
                    <button
                      type="button"
                      disabled={!canBuy || purchasing}
                      onClick={() => handlePurchase(item)}
                      style={{
                        minHeight: 36,
                        border: '2px solid var(--px-border-gold)',
                        borderRadius: 4,
                        background: canBuy ? 'rgba(255,215,0,0.12)' : 'rgba(0,0,0,0.08)',
                        color: canBuy ? 'var(--px-gold)' : 'var(--px-muted)',
                        fontWeight: 900,
                        cursor: canBuy && !purchasing ? 'pointer' : 'not-allowed',
                      }}
                    >
                      购买蓝图
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
