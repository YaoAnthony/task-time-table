const assert = require('assert');

process.env.SQLITE_DB_PATH = ':memory:';
process.env.ACCESS_SECRET = process.env.ACCESS_SECRET || 'test-access-secret';
process.env.REFRESH_SECRET = process.env.REFRESH_SECRET || 'test-refresh-secret';
process.env.Website_URL = process.env.Website_URL || 'http://localhost:4002';

const app = require('../app');
const { closeLocalDatabase } = require('../db/localDatabase');
const Profile = require('../models/Profile');
const System = require('../models/System');

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const register = await request(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'owner-leave-membership@example.test',
        password: 'Password123!',
      }),
    });
    assert.equal(register.response.status, 200);
    const token = register.body.accessToken;
    assert.ok(token, 'register should return an access token');

    const authHeaders = { Authorization: `Bearer ${token}` };

    const created = await request(baseUrl, '/system/create', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Owner membership leave system' }),
    });
    assert.equal(created.response.status, 201);
    const systemId = created.body.system._id;

    const joined = await request(baseUrl, `/system/${systemId}/join`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(joined.response.status, 201);
    assert.deepEqual(joined.body.system.relationship, { isOwner: true, isMember: true });

    const joinedList = await request(baseUrl, '/system/list', {
      method: 'GET',
      headers: authHeaders,
    });
    assert.equal(joinedList.response.status, 200);
    const joinedListSystem = joinedList.body.systems.find((item) => String(item._id) === String(systemId));
    assert.ok(joinedListSystem, 'joined owner system should be visible in list');
    assert.deepEqual(joinedListSystem.relationship, { isOwner: true, isMember: true });
    assert.equal(joinedListSystem.members, undefined, 'system list should not expose raw member records');

    const left = await request(baseUrl, `/system/${systemId}/leave`, {
      method: 'POST',
      headers: authHeaders,
    });
    assert.equal(left.response.status, 200, left.body.message);
    assert.equal(left.body.ownerMembershipOnly, true);

    const system = await System.findById(systemId);
    assert.ok(system, 'owner system should not be deleted');
    assert.equal(system.members.length, 0, 'owner member record should be removed');

    const profile = await Profile.findById(created.body.system.profile);
    assert.ok(profile.systems.some((id) => String(id) === String(systemId)), 'owner profile should keep the owned system');

    const ownerOnlyList = await request(baseUrl, '/system/list', {
      method: 'GET',
      headers: authHeaders,
    });
    assert.equal(ownerOnlyList.response.status, 200);
    const ownerOnlySystem = ownerOnlyList.body.systems.find((item) => String(item._id) === String(systemId));
    assert.ok(ownerOnlySystem, 'owned system should remain visible after owner leaves member identity');
    assert.deepEqual(ownerOnlySystem.relationship, { isOwner: true, isMember: false });

    console.log('system owner leave membership test passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeLocalDatabase();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
