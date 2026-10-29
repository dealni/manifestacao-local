export function serverHandle(r) {
  return {
    server: r.server,
    ctx: r.ctx,
    realtime: r.realtime,
    async listen(port = r.config.port ?? 4173, host = r.config.host ?? '127.0.0.1') {
      if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1')
        throw new Error('Use somente loopback para esta instalação.');
      await new Promise((resolve, reject) => {
        r.server.once('error', reject);
        r.server.listen(port, host, resolve);
      });
      return r.server.address();
    },
    async close() {
      if (r.closePromise) return r.closePromise;
      r.closePromise = (async () => {
        r.closing = true;
        const closedRealtime = r.realtime.close();
        let failure;
        try {
          r.ctx.save();
        } catch (error) {
          failure = error;
        }
        await new Promise((resolve) => {
          // Active HTTP clients must not indefinitely delay a supervised restart.
          const timer = setTimeout(() => r.server.closeAllConnections(), 5000);
          timer.unref();
          r.server.close(() => {
            clearTimeout(timer);
            resolve();
          });
          r.server.closeIdleConnections();
        });
        await closedRealtime;
        try {
          await r.persistence.flush();
        } catch (error) {
          failure ??= error;
        }
        try {
          await r.persistence.close();
        } catch (error) {
          failure ??= error;
        }
        if (failure) throw failure;
      })();
      return r.closePromise;
    },
  };
}
