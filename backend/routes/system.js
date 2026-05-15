const express = require('express');
const mongoose = require('mongoose');

const authenticateToken = require('../middlewares/authenticateToken');
const User = require('../models/User');
const Profile = require('../models/Profile');
const System = require('../models/System');

const createSystemDomainService = require('./modules/services/createSystemDomainService');
const createSystemEventBus = require('./modules/shared/createSystemEventBus');
const registerSystemSseRoutes = require('./modules/realtime/registerSystemSseRoutes');
const registerSystemOwnerCoreRoutes = require('./modules/system.ownerCoreRoutes');
const registerSystemAiRoutes = require('./modules/system.aiRoutes');
const registerSystemMemberTaskRoutes = require('./modules/system.memberTaskRoutes');
const registerSystemStoreRoutes = require('./modules/system.storeRoutes');
const registerSystemDailyQuestRoutes = require('./modules/system.dailyQuestRoutes');

const router = express.Router();

const domainService = createSystemDomainService({
    mongoose,
    User,
    Profile,
    System,
});

const eventBus = createSystemEventBus();

registerSystemMemberTaskRoutes(router, {
    authenticateToken,
    findSystemForUser: domainService.findSystemForUser,
    findSystemForParticipant: domainService.findSystemForParticipant,
    findMemberByUserId: domainService.findMemberByUserId,
    findMissionListById: domainService.findMissionListById,
    findMemberMissionListState: domainService.findMemberMissionListState,
    hasMemberCompletedNode: domainService.hasMemberCompletedNode,
    hasMemberFailedNode: domainService.hasMemberFailedNode,
    normalizeAttributeName: domainService.normalizeAttributeName,
    applyTaskRewardsToProfile: domainService.applyTaskRewardsToProfile,
    applyMissionFailurePenaltyToProfile: domainService.applyMissionFailurePenaltyToProfile,
    findNodeByNodeId: domainService.findNodeByNodeId,
    emitSystemTaskEvent: eventBus.emitSystemTaskEvent,
    Profile,
});

registerSystemStoreRoutes(router, {
    authenticateToken,
    Profile,
    findSystemForParticipant: domainService.findSystemForParticipant,
    findSystemForUser: domainService.findSystemForUser,
    findMemberByUserId: domainService.findMemberByUserId,
    findItemReferenceInSystem: domainService.findItemReferenceInSystem,
    emitSystemTaskEvent: eventBus.emitSystemTaskEvent,
    emitSystemUpdateEvent: eventBus.emitSystemUpdateEvent,
});

registerSystemOwnerCoreRoutes(router, {
    authenticateToken,
    Profile,
    System,
    ATTRIBUTE_CATEGORIES: domainService.ATTRIBUTE_CATEGORIES,
    isValidObjectId: domainService.isValidObjectId,
    normalizeNodeId: domainService.normalizeNodeId,
    ensureProfile: domainService.ensureProfile,
    findSystemForUser: domainService.findSystemForUser,
    findSystemForParticipant: domainService.findSystemForParticipant,
    findMemberByUserId: domainService.findMemberByUserId,
    findMissionListById: domainService.findMissionListById,
    findNodeByNodeId: domainService.findNodeByNodeId,
    buildAllowedRewardItemKeys: domainService.buildAllowedRewardItemKeys,
    validateRewardItemKeys: domainService.validateRewardItemKeys,
    validateAgainstObtainableItems: domainService.validateAgainstObtainableItems,
    buildProfileCleanupUpdateForSystemDeletion: domainService.buildProfileCleanupUpdateForSystemDeletion,
    emitSystemTaskEvent: eventBus.emitSystemTaskEvent,
    emitSystemUpdateEvent: eventBus.emitSystemUpdateEvent,
});

registerSystemAiRoutes(router, {
    authenticateToken,
    findSystemForUser: domainService.findSystemForUser,
    findMissionListById: domainService.findMissionListById,
    findNodeByNodeId: domainService.findNodeByNodeId,
    emitSystemUpdateEvent: eventBus.emitSystemUpdateEvent,
});

registerSystemDailyQuestRoutes(router, {
    authenticateToken,
    Profile,
    findSystemForUser: domainService.findSystemForUser,
    findSystemForParticipant: domainService.findSystemForParticipant,
    findMemberByUserId: domainService.findMemberByUserId,
    applyTaskRewardsToProfile: domainService.applyTaskRewardsToProfile,
    emitSystemUpdateEvent: eventBus.emitSystemUpdateEvent,
});

registerSystemSseRoutes(router, {
    findSystemForUser: domainService.findSystemForUser,
    findSystemForParticipant: domainService.findSystemForParticipant,
    registerSystemTaskEventClient: eventBus.registerSystemTaskEventClient,
    unregisterSystemTaskEventClient: eventBus.unregisterSystemTaskEventClient,
    registerSystemUpdateEventClient: eventBus.registerSystemUpdateEventClient,
    unregisterSystemUpdateEventClient: eventBus.unregisterSystemUpdateEventClient,
});

module.exports = router;
