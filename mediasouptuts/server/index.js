const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mediasoup = require("mediasoup");
const app = express();
const server = http.createServer(app);

const cors = require("cors");
const {
  joinRoomHandler,
  createWebRTCTransportHandler,
  connectWebRTCTransportHandler,
  transportProduceHandler,
  getProducersHandler,
  transportRecvConnectHandler,
  consumeHander,
  serverConsumerResumeHandler,
  disconnectHandler,
  chatMessageHandler,
  startRecordingHandler,
  pollHandler,
} = require("./socketcontrollers/index");

app.use(cors());

const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let worker;
let router;

(async () => {
  worker = await mediasoup.createWorker({
    logLevel: "warn",
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  });

  console.log("workerc created", worker.pid);
})();

io.on("connection", (socket) => {
  console.log("client connnected", socket.id);

  // create new room along with webRTCTransport

  socket.on("join-room", (data, callback) => {
    joinRoomHandler(data, callback, socket, worker, io);
  });

  socket.on("create-web-rtc-transport", async ({ consumer }, callback) => {
    createWebRTCTransportHandler(consumer, callback, socket, worker);
  });

  socket.on("transport-connect", async ({ dtlsParameters }) => {
    connectWebRTCTransportHandler(dtlsParameters, socket, worker);
  });

  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      transportProduceHandler(
        kind,
        rtpParameters,
        appData,
        callback,
        socket,
        worker,
        io
      );
    }
  );

  socket.on("getProducers", (callback) => {
    getProducersHandler(callback, socket, worker);
  });

  socket.on(
    "transport-recv-connect",
    async ({ dtlsParameters, serverConsumerTransportId }) => {
      transportRecvConnectHandler(
        dtlsParameters,
        serverConsumerTransportId,
        socket,
        worker
      );
    }
  );

  socket.on(
    "consume",
    async (
      { rtpCapabilities, remoteProducerId, serverConsumerTransportId },
      callback
    ) => {
      consumeHander(
        rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
        callback,
        socket,
        worker
      );
    }
  );
  socket.on("consumer-resume", async ({ serverConsumerId }) => {
    serverConsumerResumeHandler(serverConsumerId, socket, worker);
  });

  socket.on("send-poll", (data) => {
    pollHandler(data, socket);
  });

  socket.on("chat-msg", async ({ msg }) => {
    chatMessageHandler(msg, socket, worker, io);
  });

  socket.on("start-recording", async (data) => {
    startRecordingHandler(data, socket, worker, io);
  });

  socket.on("disconnect", () => {
    disconnectHandler(socket, worker, io);
  });
});

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
