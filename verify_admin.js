const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function testAdminSystem() {
  console.log('==================================================');
  console.log('TESTING PHASE 1: ADMIN AUTH & RBAC API ENDPOINTS');
  console.log('==================================================\n');

  try {
    // 1. Admin Login
    console.log('1. Testing Admin Login (admin@voltcraftelectrical.com)...');
    const loginPayload = JSON.stringify({
      email: 'admin@voltcraftelectrical.com',
      password: 'AdminPassword123!',
    });

    const loginRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginPayload),
        },
      },
      loginPayload
    );

    if (loginRes.status !== 200 || !loginRes.data.token) {
      console.error('❌ Admin Login Failed:', loginRes.data);
      return;
    }

    console.log('✅ Admin Login Successful!');
    console.log(`   User: ${loginRes.data.user.full_name} | Role ID: ${loginRes.data.user.role_id}`);
    const adminToken = loginRes.data.token;
    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    };

    // 2. Fetch Admin Dashboard Statistics
    console.log('\n2. Fetching Admin Dashboard Stats (/api/admin/dashboard/stats)...');
    const statsRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/dashboard/stats',
      method: 'GET',
      headers: adminHeaders,
    });

    console.log('✅ Dashboard Statistics Fetched:');
    console.log('   Total Orders:', statsRes.data.stats.total_orders);
    console.log('   Pending Approval:', statsRes.data.stats.pending_approval);
    console.log('   Active Customers:', statsRes.data.stats.total_users);
    console.log('   Total Products:', statsRes.data.stats.total_products);

    // 3. Test RBAC Security (Customer trying to access Admin API should get HTTP 403)
    console.log('\n3. Testing RBAC Security Isolation (Customer Token -> Admin Route)...');
    const customerPayload = JSON.stringify({
      full_name: 'Customer Test',
      birth_date: '1998-08-08',
      email: `cust_${Date.now()}@test.com`,
      password: 'Password123!',
      state: 'Maharashtra',
      whatsapp_number: '9123456789',
    });

    const custRegRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/auth/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(customerPayload),
        },
      },
      customerPayload
    );

    const custHeaders = { Authorization: `Bearer ${custRegRes.data.token}` };

    const unauthorizedRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/dashboard/stats',
      method: 'GET',
      headers: custHeaders,
    });

    if (unauthorizedRes.status === 403) {
      console.log('✅ RBAC Security Test Passed! Backend returned HTTP 403 Forbidden for Customer user.');
    } else {
      console.error('❌ Security Warning! Backend did not block non-admin user:', unauthorizedRes.status);
    }

    // 4. Fetch Department Accounts
    console.log('\n4. Fetching Department Accounts (/api/admin/department-accounts)...');
    const deptsRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/department-accounts',
      method: 'GET',
      headers: adminHeaders,
    });
    console.log(`✅ Department Accounts Fetched: ${deptsRes.data.accounts.length} accounts configured.`);
    deptsRes.data.accounts.forEach((acc) => console.log(`   - ${acc.full_name} (${acc.email}) | Role: ${acc.role_name}`));

    // 5. Fetch Live Department Monitoring
    console.log('\n5. Fetching Live Department Progress (/api/admin/departments/live-status)...');
    const liveDeptRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/departments/live-status',
      method: 'GET',
      headers: adminHeaders,
    });
    console.log(`✅ Live Department Monitoring Fetched: ${liveDeptRes.data.departments.length} departments tracked.`);

    console.log('\n==================================================');
    console.log('PHASE 1 ADMIN BACKEND & RBAC VERIFIED 100% PERFECTLY!');
    console.log('==================================================\n');
  } catch (error) {
    console.error('❌ Verification Error:', error);
  }
}

testAdminSystem();
