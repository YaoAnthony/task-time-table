const assert = require('assert');

process.env.SQLITE_DB_PATH = ':memory:';

const objectIds = require('../db/objectIdCompat');
const User = require('../models/User');
const Profile = require('../models/Profile');
const System = require('../models/System');
const createSystemDomainService = require('../routes/modules/services/createSystemDomainService');

async function run() {
  const user = await User.create({
    email: 'mission-list-identity@example.test',
    username: 'mission-list-identity',
  });
  const profile = await Profile.create({ user: user._id, systems: [] });
  user.profile = profile._id;
  await user.save();

  const system = await System.create({
    profile: profile._id,
    name: 'Legacy AI system',
    missionLists: [
      {
        listType: 'mainline',
        title: 'AI generated plan without id',
        rootNodeId: 'node-1',
        taskTree: [
          {
            nodeId: 'node-1',
            parentNodeId: null,
            prerequisiteNodeIds: [],
            title: 'Start',
            timeCostMinutes: 1,
            childrenNodeIds: [],
            status: 'pending',
          },
        ],
      },
    ],
    members: [
      {
        user: user._id,
        profile: profile._id,
        joinedAt: new Date(),
      },
    ],
  });
  profile.systems.push(system._id);
  await profile.save();

  const domain = createSystemDomainService({
    objectIds,
    User,
    Profile,
    System,
  });

  const participantResult = await domain.findSystemForParticipant(user._id, system._id);
  assert.ifError(participantResult.error);

  const repairedMissionList = participantResult.system.missionLists[0];
  assert.ok(objectIds.Types.ObjectId.isValid(String(repairedMissionList._id)), 'legacy mission list should get a real id');

  const member = domain.findMemberByUserId(participantResult.system, user._id);
  assert.ok(Array.isArray(member.acceptedMissionLists), 'legacy member should get acceptedMissionLists');
  assert.ok(Array.isArray(member.taskHistory), 'legacy member should get taskHistory');
  assert.ok(Array.isArray(member.dailyQuestStatus), 'legacy member should get dailyQuestStatus');

  const legacyLookup = domain.findMissionListById(participantResult.system, 'undefined');
  assert.ifError(legacyLookup.error);
  assert.equal(String(legacyLookup.list._id), String(repairedMissionList._id));

  member.acceptedMissionLists.push({
    missionListId: legacyLookup.list._id,
    acceptedAt: new Date(),
    hasFailed: false,
    completedAt: null,
  });
  await participantResult.system.save();

  const reloaded = await System.findById(system._id);
  assert.equal(String(reloaded.missionLists[0]._id), String(repairedMissionList._id));
  assert.equal(reloaded.members[0].acceptedMissionLists.length, 1);

  console.log('system mission list identity test passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
