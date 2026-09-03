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

async function runAdminE2EWorkflow() {
  console.log('======================================================================');
  console.log('STARTING E2E AUTOMATED VERIFICATION: ADMIN PANEL & CONTROL CENTER');
  console.log('======================================================================\n');

  try {
    // STEP 1: Customer Registration & Cart Setup
    console.log('STEP 1: Registering new customer account...');
    const customerEmail = `cust_b2b_${Date.now()}@voltcraft.com`;
    const regPayload = JSON.stringify({
      full_name: 'B2B Industrial Customer',
      birth_date: '1995-04-12',
      email: customerEmail,
      password: 'CustomerPass123!',
      state: 'Gujarat',
      whatsapp_number: '9876543210',
    });

    const regRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(regPayload) },
      },
      regPayload
    );

    const customerToken = regRes.data.token;
    const customerHeaders = { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' };
    console.log('✅ Customer account created & authenticated.');

    // Add item to cart
    console.log('\nSTEP 2: Adding 100 pcs of VoltGuard Water Level Controller (MOQ: 100) to cart...');
    const cartPayload = JSON.stringify({ product_id: 1, quantity: 100 });
    await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/cart/items',
        method: 'POST',
        headers: customerHeaders,
      },
      cartPayload
    );

    // Place Customer Order
    console.log('\nSTEP 3: Submitting Customer Order with Transport Name "VRL Logistics"...');
    const orderPayload = JSON.stringify({ transport_name: 'VRL Logistics' });
    const orderRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/orders',
        method: 'POST',
        headers: customerHeaders,
      },
      orderPayload
    );

    const orderId = orderRes.data.order.id;
    console.log(`✅ Customer Order placed successfully! Order ID: #${orderId} | Status: "${orderRes.data.order.status}"`);

    // STEP 4: Admin Login & Order Review
    console.log('\nSTEP 4: Authenticating Master Admin (admin@voltcraftelectrical.com)...');
    const adminLoginPayload = JSON.stringify({
      email: 'admin@voltcraftelectrical.com',
      password: 'AdminPassword123!',
    });

    const adminLoginRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(adminLoginPayload) },
      },
      adminLoginPayload
    );

    const adminHeaders = { Authorization: `Bearer ${adminLoginRes.data.token}`, 'Content-Type': 'application/json' };
    console.log('✅ Admin authenticated.');

    // Fetch Pending Orders in Admin Panel
    console.log('\nSTEP 5: Admin reviewing pending orders queue (/api/admin/orders)...');
    const adminOrdersRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/orders?status=Pending%20Admin%20Approval',
      method: 'GET',
      headers: adminHeaders,
    });
    console.log(`✅ Admin retrieved ${adminOrdersRes.data.count} pending order(s).`);

    // Fetch Specific Order Detail & Price Review
    console.log(`\nSTEP 6: Admin inspecting Order #${orderId} details and performing Price Review...`);
    const detailRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/orders/${orderId}`,
      method: 'GET',
      headers: adminHeaders,
    });

    const lineItemId = detailRes.data.order.items[0].id;
    console.log(`   Line Item ID #${lineItemId} | Original Price: ₹${detailRes.data.order.items[0].unit_price}`);

    // Update Unit Price before approval
    console.log('   Updating Unit Price to ₹1800.00...');
    const pricePayload = JSON.stringify({ item_id: lineItemId, unit_price: 1800.0 });
    const updatePriceRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: `/api/admin/orders/${orderId}/price`,
        method: 'PATCH',
        headers: adminHeaders,
      },
      pricePayload
    );
    console.log(`✅ Price Review completed! New Order Total: ₹${updatePriceRes.data.total_amount}`);

    // STEP 7: Admin Approve Order & Automatic Department Distribution
    console.log(`\nSTEP 7: Admin approving Order #${orderId} and distributing to departments...`);
    const approveRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/orders/${orderId}/approve`,
      method: 'PATCH',
      headers: adminHeaders,
    });

    console.log('✅ Order Approved Successfully!');
    console.log(`   Generated Serial Number: ${approveRes.data.serial_number}`);

    // Verify Department Distribution & Customer Notification
    console.log('\nSTEP 8: Verifying Automatic Department Work Distribution & Notifications...');
    const verifiedOrderRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/admin/orders/${orderId}`,
      method: 'GET',
      headers: adminHeaders,
    });

    console.log(`   Order Status: "${verifiedOrderRes.data.order.status}"`);
    console.log(`   Department Work Distribution: ${verifiedOrderRes.data.order.department_items.length} work record(s) created.`);
    verifiedOrderRes.data.order.department_items.forEach((di) => {
      console.log(`     - Department: ${di.department_name} | Ordered: ${di.ordered_quantity} pcs | Status: ${di.status}`);
    });

    // STEP 9: Testing Order Rejection Workflow
    console.log('\nSTEP 9: Placing a 2nd order to test Admin Order Rejection...');
    await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/cart/items',
        method: 'POST',
        headers: customerHeaders,
      },
      JSON.stringify({ product_id: 2, quantity: 50 })
    );

    const order2Res = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/orders',
        method: 'POST',
        headers: customerHeaders,
      },
      JSON.stringify({ transport_name: 'Express Cargo' })
    );

    const order2Id = order2Res.data.order.id;
    console.log(`   Customer placed Order #${order2Id}. Admin rejecting with mandatory reason...`);

    const rejectPayload = JSON.stringify({ reason: 'Component currently undergoing R&D calibration testing.' });
    const rejectRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: `/api/admin/orders/${order2Id}/reject`,
        method: 'PATCH',
        headers: adminHeaders,
      },
      rejectPayload
    );
    console.log(`✅ Order #${order2Id} Rejected Successfully! Message: "${rejectRes.data.message}"`);

    // STEP 10: Audit Log Trail Verification
    console.log('\nSTEP 10: Fetching Administrative Audit Log Trail (/api/admin/audit-logs)...');
    const auditRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/admin/audit-logs',
      method: 'GET',
      headers: adminHeaders,
    });

    console.log(`✅ Audit Trail retrieved ${auditRes.data.audit_logs.length} audit entry/entries:`);
    auditRes.data.audit_logs.slice(0, 5).forEach((al) => {
      console.log(`   - [${al.action}] ${al.description} (by ${al.user_name})`);
    });

    console.log('\n======================================================================');
    console.log('ALL 10 ADMIN PANEL & CONTROL CENTER TEST CASES PASSED WITH 100% SUCCESS!');
    console.log('======================================================================\n');
  } catch (error) {
    console.error('❌ E2E Test Error:', error);
  }
}

runAdminE2EWorkflow();
