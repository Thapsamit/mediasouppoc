let rooms = {}; // { roomName1: { Router, peers: [ sicketId1, ... ] }, ...}
let peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []; // [ { socketId1, roomName1, producer, }, ... ] // contains all producers across rooms
let consumers = []; // [ { socketId1, roomName1, consumer, }, ... ] // contains all consumers across rooms
const producerToRecordingMap = {};
module.exports = {
  rooms,
  peers,
  transports,
  producers,
  consumers,
  producerToRecordingMap,
};
