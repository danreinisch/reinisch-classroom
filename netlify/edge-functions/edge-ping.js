export default () =>
  new Response('edge ok', {
    status: 200,
    headers: { 'content-type': 'text/plain' }
  });
