const assert = require('assert');

const {
  callGameMcpTool,
  normalizeNpcActionsForRuntime,
} = require('../services/gameMcpToolService');

const toolContext = {
  perceptionContext: {
    self: { worldId: 'world:village' },
    visibleObjects: [
      {
        id: 'house_laoli_1',
        type: 'house',
        x: 320,
        y: 420,
        worldId: 'world:village',
        meta: {
          displayId: '老李的房子',
          roomId: 'room:house_laoli_1',
          summary: 'ready house near Lao Li',
        },
      },
    ],
  },
};

function run() {
  const toolResult = callGameMcpTool('use_skill', { skillId: 'remember_home_house' }, toolContext);
  assert.equal(toolResult.ok, true);
  assert.equal(toolResult.action.type, 'remember_home_house');
  assert.equal(toolResult.action.houseId, 'house_laoli_1');
  assert.equal(toolResult.action.roomId, 'room:house_laoli_1');

  const normalized = normalizeNpcActionsForRuntime([
    { type: 'use_skill', skillId: 'remember_home_house' },
    { type: 'use_skill', skillId: 'remember-home' },
    { type: 'use_skill', skillId: 'go_home' },
  ], toolContext);

  assert.deepEqual(normalized, [
    { type: 'remember_home_house', houseId: 'house_laoli_1', roomId: 'room:house_laoli_1' },
    { type: 'enter_house', houseId: 'house_laoli_1', roomId: 'room:house_laoli_1' },
  ]);

  console.log('npc MCP action normalization test passed');
}

run();
