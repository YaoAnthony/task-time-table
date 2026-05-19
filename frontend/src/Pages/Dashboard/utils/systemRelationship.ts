import type { SystemLite } from '../../../Types/System';

const sameId = (left?: string | null, right?: string | null) => (
    Boolean(left && right) && String(left) === String(right)
);

const hasRelationshipPayload = (system: SystemLite) => (
    Boolean(system.relationship)
    || typeof system.isOwner === 'boolean'
    || typeof system.isMember === 'boolean'
);

export const isOwnedSystem = (system: SystemLite, profileId?: string | null) => {
    if (hasRelationshipPayload(system)) {
        return Boolean(system.relationship?.isOwner ?? system.isOwner);
    }
    return sameId(system.profile || null, profileId || null);
};

export const isMemberSystem = (system: SystemLite, profileId?: string | null) => {
    if (hasRelationshipPayload(system)) {
        return Boolean(system.relationship?.isMember ?? system.isMember);
    }
    return Boolean(profileId) && !sameId(system.profile || null, profileId || null);
};

export const uniqueSystems = (systems: SystemLite[]) => {
    const seen = new Set<string>();
    return systems.filter((system) => {
        if (!system?._id || seen.has(system._id)) return false;
        seen.add(system._id);
        return true;
    });
};

export const getOwnedSystems = (systems: SystemLite[], profileId?: string | null) => (
    uniqueSystems(systems).filter((system) => isOwnedSystem(system, profileId))
);

export const getMemberSystems = (systems: SystemLite[], profileId?: string | null) => (
    uniqueSystems(systems).filter((system) => isMemberSystem(system, profileId))
);

export const getVisibleSystems = (systems: SystemLite[]) => uniqueSystems(systems);
