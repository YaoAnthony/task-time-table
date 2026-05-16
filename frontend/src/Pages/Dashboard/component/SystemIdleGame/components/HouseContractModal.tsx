import React, { useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { message } from 'antd';
import {
  useCreateGameHouseContractMutation,
  useGetGameHouseContractsQuery,
  useGetGameNpcShopQuery,
  useSignGameHouseContractMutation,
} from '../../../../../api/profileStateRtkApi';
import type { GameScene } from '../GameScene';

interface HouseContractModalProps {
  open: boolean;
  roomId?: string | null;
  sceneRef: RefObject<GameScene | null>;
  onClose: () => void;
}

export const HouseContractModal: React.FC<HouseContractModalProps> = ({ open, roomId, sceneRef, onClose }) => {
  const { data: houseData, refetch } = useGetGameHouseContractsQuery(roomId ?? undefined, { skip: !open });
  const { data: npcData } = useGetGameNpcShopQuery(roomId ?? undefined, { skip: !open });
  const [createContract, { isLoading: creating }] = useCreateGameHouseContractMutation();
  const [signContract, { isLoading: signing }] = useSignGameHouseContractMutation();
  const houses = useMemo(() => (
    (houseData?.houses ?? []).filter((house) => String(house.stage).startsWith('ready') && house.tenancy.status !== 'occupied')
  ), [houseData?.houses]);
  const npcs = (npcData?.npcs ?? []).filter((npc) => npc.owned);
  const [houseId, setHouseId] = useState('');
  const [npcId, setNpcId] = useState('');

  if (!open) return null;

  const selectedHouse = houses.find((house) => house.id === houseId) ?? houses[0];
  const selectedNpc = npcs.find((npc) => npc.id === npcId) ?? npcs[0];

  const handleSign = async () => {
    if (!selectedHouse || !selectedNpc) {
      message.info('需要一间完工空房和一个已解锁 NPC。');
      return;
    }
    try {
      const created = await createContract({
        houseId: selectedHouse.id,
        npcId: selectedNpc.id,
        npcName: selectedNpc.name,
        rentPerDay: selectedHouse.economy.rentPerDay,
        gameTick: sceneRef.current?.getGameTick?.() ?? undefined,
        roomId,
      }).unwrap();
      const signed = await signContract({
        contractId: created.contract.id,
        gameTick: sceneRef.current?.getGameTick?.() ?? undefined,
        roomId,
      }).unwrap();
      sceneRef.current?.loadHouseGameSaveData(signed.gameSave);
      message.success(`${selectedNpc.name} 已经签下住房合同。`);
      refetch();
      onClose();
    } catch (error) {
      const err = error as { data?: { message?: string } };
      message.error(err?.data?.message || '签合同失败');
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="房屋合同" style={{
      position: 'absolute',
      inset: 0,
      zIndex: 435,
      background: 'rgba(7, 10, 12, 0.55)',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      fontFamily: '"Courier New", monospace',
    }}>
      <section style={{
        width: 'min(720px, 94vw)',
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
        }}>
          <h2 style={{ margin: 0, color: 'var(--px-gold)', fontSize: 20 }}>房屋合同</h2>
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
        </header>
        <div style={{ padding: 16, display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, color: 'var(--px-text)' }}>
            房子
            <select
              value={selectedHouse?.id ?? ''}
              onChange={(event) => setHouseId(event.target.value)}
              style={{ minHeight: 36, border: '2px solid var(--px-border)', background: 'var(--px-surface2)' }}
            >
              {houses.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.id.slice(0, 10)} · {house.economy.rentPerDay} 金币/天
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, color: 'var(--px-text)' }}>
            NPC
            <select
              value={selectedNpc?.id ?? ''}
              onChange={(event) => setNpcId(event.target.value)}
              style={{ minHeight: 36, border: '2px solid var(--px-border)', background: 'var(--px-surface2)' }}
            >
              {npcs.map((npc) => (
                <option key={npc.id} value={npc.id}>{npc.name}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selectedHouse || !selectedNpc || creating || signing}
            onClick={handleSign}
            style={{
              minHeight: 40,
              border: '2px solid var(--px-border-gold)',
              borderRadius: 4,
              background: 'rgba(255,215,0,0.12)',
              color: 'var(--px-gold)',
              fontWeight: 900,
              cursor: selectedHouse && selectedNpc && !creating && !signing ? 'pointer' : 'not-allowed',
            }}
          >
            签合同入住
          </button>
        </div>
      </section>
    </div>
  );
};
