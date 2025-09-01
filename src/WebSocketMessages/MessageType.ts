enum MessageType {
    TEXT = 0,
    BINARY_FILE = 1,
    ETABLE_VALUES = 2,
    ETABLE_TEXT = 3,
    ETABLE_DAYTIMER = 4,
    OUT_OF_SERVICE = 5,
    KEEPALIVE = 6,
    ETABLE_WEATHER = 7,

    HEADER = 99,
}

export default MessageType;
