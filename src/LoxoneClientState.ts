enum LoxoneClientState {
    disconnected,
    disconnecting,
    connecting,
    connected,
    authenticating,
    authenticated,
    ready,
    reconnecting,
    error
}

export default LoxoneClientState;