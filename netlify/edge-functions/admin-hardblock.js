export default () =>
  new Response('Blocked by edge (admin-hardblock)', {
    status: 401,
    headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' }
  });
