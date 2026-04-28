Deno.serve({ port: 3000 }, async (req) => {
    const url = new URL(req.url);
    let path = url.pathname === '/' ? '/index.html' : url.pathname;

    try {
        const file = await Deno.readFile(`.${path}`);
        const ext = path.split('.').pop();
        const mime = {
            html: 'text/html',
            js: 'text/javascript',
            css: 'text/css',
            wasm: 'application/wasm',
            svg: 'image/svg+xml',
            json: 'application/json',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            ico: 'image/x-icon',
        }[ext] || 'application/octet-stream';

        return new Response(file, {
            headers: {
                'Content-Type': mime,
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
                'Cross-Origin-Resource-Policy': 'same-origin',
            },
        });
    } catch {
        return new Response('Not found', { status: 404 });
    }
});

console.log('Server running at http://localhost:3000');
