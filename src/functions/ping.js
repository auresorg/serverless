const { app } = require('@azure/functions');

app.http('ping', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        // context.log(`Http function processed request for url "${request.url}"`);
        return { pong: true };
    }
});
