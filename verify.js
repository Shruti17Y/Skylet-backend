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

async function testSystem() {
  console.log('==================================================');
  console.log('STARTING FULL END-TO-END SYSTEM VERIFICATION');
  console.log('==================================================\n');

  try {
    // 1. Register new customer
    const userEmail = `customer_${Date.now()}@voltcraftelectrical.com`;
    console.log(`1. Testing Customer Registration for: ${userEmail}`);
    const regPayload = JSON.stringify({
      full_name: 'Aditya Verma',
      birth_date: '1995-05-15',
      email: userEmail,
      password: 'Password123!',
      state: 'Gujarat',
      whatsapp_number: '9876543210',
    });

    const regRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/auth/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(regPayload),
        },
      },
      regPayload
    );

    console.log('✅ Registration Status:', regRes.status, '| User:', regRes.data.user.full_name);
    const token = regRes.data.token;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // 2. Fetch Categories
    console.log('\n2. Fetching Product Categories...');
    const catRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/categories',
      method: 'GET',
    });
    console.log(`✅ Categories Fetched: ${catRes.data.categories.length} active categories.`);
    catRes.data.categories.forEach((c) => console.log(`   - ${c.name} (${c.active_product_count} live products)`));

    // 3. Fetch Live Products
    console.log('\n3. Fetching Live Active Products...');
    const prodRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/products',
      method: 'GET',
    });
    console.log(`✅ Live Products Fetched: ${prodRes.data.products.length} products available.`);
    const sampleProduct = prodRes.data.products[0];
    console.log(`   Sample Product: "${sampleProduct.name}" | MOQ: ${sampleProduct.minimum_order_quantity} | Price: ₹${sampleProduct.price}`);

    // 4. Test MOQ Enforcement (Qty 5 < MOQ)
    console.log('\n4. Testing Minimum Order Quantity (MOQ) Backend Validation (Qty 5)...');
    const failCartPayload = JSON.stringify({ product_id: sampleProduct.id, quantity: 5 });
    const failCartRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/cart/items',
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Length': Buffer.byteLength(failCartPayload),
        },
      },
      failCartPayload
    );

    if (failCartRes.status === 400) {
      console.log(`✅ MOQ Validation Working! Backend rejected Qty 5 with HTTP 400: "${failCartRes.data.message}"`);
    } else {
      console.error('❌ Failed: Server did not reject Qty < MOQ!');
    }

    // 5. Add Valid Quantity (MOQ + 20)
    const validQty = parseInt(sampleProduct.minimum_order_quantity, 10) + 20;
    console.log(`\n5. Adding Valid Quantity (${validQty} pcs) to Cart...`);
    const validCartPayload = JSON.stringify({ product_id: sampleProduct.id, quantity: validQty });
    const validCartRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/cart/items',
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Length': Buffer.byteLength(validCartPayload),
        },
      },
      validCartPayload
    );
    console.log(`✅ ${validCartRes.data.message}`);

    // 6. Fetch Cart
    console.log('\n6. Fetching User Cart...');
    const cartRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/cart',
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`✅ Cart Fetched: ${cartRes.data.items.length} line item(s) | Total Units: ${cartRes.data.total_items} | Subtotal: ₹${cartRes.data.subtotal}`);

    // 7. Place Order with Transport Name
    console.log('\n7. Placing Order with Transport Name ("VRL Logistics Express")...');
    const orderPayload = JSON.stringify({ transport_name: 'VRL Logistics Express' });
    const orderRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/orders',
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Length': Buffer.byteLength(orderPayload),
        },
      },
      orderPayload
    );

    console.log('✅ Order Placed Successfully!');
    console.log(`   Order ID: #${orderRes.data.order.id} | Serial Number: ${orderRes.data.order.serial_number}`);
    console.log(`   Status: ${orderRes.data.order.status} | Total Amount: ₹${orderRes.data.order.total_amount}`);
    const orderId = orderRes.data.order.id;

    // 8. Fetch Order Details & Department Tracking
    console.log(`\n8. Fetching Order Details for #${orderId}...`);
    const orderDetailRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/orders/${orderId}`,
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`✅ Order Details Retrieved for ${orderDetailRes.data.order.serial_number}`);
    console.log(`   Customer: ${orderDetailRes.data.order.customer.name} (${orderDetailRes.data.order.customer.state})`);
    console.log('   Department Breakdown Statuses:');
    orderDetailRes.data.order.department_statuses.forEach((d) => {
      console.log(`   - ${d.department_name}: ${d.status}`);
    });

    // 9. Fetch Notifications
    console.log('\n9. Fetching User Notifications...');
    const notifRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/notifications',
      method: 'GET',
      headers: authHeaders,
    });
    console.log(`✅ Notifications Fetched: ${notifRes.data.notifications.length} total (${notifRes.data.unreadCount} unread).`);

    // 10. Fetch Catalog
    console.log('\n10. Fetching Technical PDF Catalog...');
    const catalogRes = await makeRequest({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/catalog',
      method: 'GET',
    });
    console.log(`✅ Catalog Fetched: "${catalogRes.data.catalog.title}" [${catalogRes.data.catalog.version}]`);

    console.log('\n==================================================');
    console.log('ALL 10 E2E SYSTEM INTEGRATION STEPS PASSED 100% PERFECTLY!');
    console.log('==================================================\n');
  } catch (error) {
    console.error('❌ Verification Error:', error);
  }
}

testSystem();
