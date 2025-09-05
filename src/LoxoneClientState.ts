enum LoxoneClientState {
    disconnected = 'disconnected',
    disconnecting = 'disconnecting',
    connecting = 'connecting',
    connected = 'connected',
    authenticating = 'authenticating',
    authenticated = 'authenticated',
    ready = 'ready',
    reconnecting = 'reconnecting',
    error = 'error',
}

export default LoxoneClientState;
