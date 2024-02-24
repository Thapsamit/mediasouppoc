const uuidv4 = require("uuid").v4;
let {
  rooms,
  peers,
  transports,
  producers,
  consumers,
  producerToRecordingMap,
} = require("../models");

// const ffmpeg = require("fluent-ffmpeg");
// ffmpeg.setFfmpegPath("C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe");

const path = require("path");
const uploadFolder = path.join(__dirname, "../recordinguploads/");

const { spawn } = require("child_process");

const fs = require("fs");

const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },

  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/VP9",
    clockRate: 90000,
    parameters: {
      "profile-id": 2,
      "x-google-start-bitrate": 1000,
    },
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];

const getCodecInfoFromRtpParameters = (kind, rtpParameters) => {
  return {
    payloadType: rtpParameters.codecs[0].payloadType,
    codecName: rtpParameters.codecs[0].mimeType.replace(`${kind}/`, ""),
    clockRate: rtpParameters.codecs[0].clockRate,
    channels: kind === "audio" ? rtpParameters.codecs[0].channels : undefined,
  };
};

// const createNewRoom = async (data, callback, socket, router) => {
//   const { identity } = data;
//   const roomId = uuidv4();
//   const newUser = {
//     identity: identity,
//     socketId: socket.id,
//     roomId: roomId,
//   };
//   connectedUsers.push(newUser);

//   const room = {
//     peers: new Map(),
//   };

//   room.peers.set(socket.id, {
//     socketId: socket.id,
//     identity: identity,
//     producers: null,
//     consumers: new Map(),
//   });
//   rooms.set(roomId, room);

//   const rtpCapabilities = router.rtpCapabilities;

//   callback({
//     roomId,
//     rtpCapabilities,
//   });
// };

// const createProducerTransport = async (data, callback, socket, router) => {
//   const transport = await router.createWebRtcTransport({
//     listenIps: [{ ip: "127.0.0.1" }], // Replace 'your-public-ip' with your server's public IP
//     enableUdp: true,
//     enableTcp: true,
//   });
//   producers.set(transport.id, transport);

//   transport.on("dtlsstatechange", (dtlsState) => {
//     if (dtlsState === "closed") {
//       transport.close();
//       producers.delete(transport.id);
//     }
//   });
//   transport.on("close", () => {
//     console.log("transport closed", transport.id);
//   });

//   const params = {
//     id: transport.id,
//     iceParameters: transport.iceParameters,
//     iceCandidates: transport.iceCandidates,
//     dtlsParameters: transport.dtlsParameters,
//   };
//   callback(params);
// };

// const createConsumerTransport = async (data, callback, socket, router) => {
//   const transport = await router.createWebRtcTransport({
//     listenIps: [{ ip: "127.0.0.1" }], // Replace 'your-public-ip' with your server's public IP
//     enableUdp: true,
//     enableTcp: true,
//   });

//   consumers.set(transport.id, transport);

//   const params = {
//     id: transport.id,
//     iceParameters: transport.iceParameters,
//     iceCandidates: transport.iceCandidates,
//     dtlsParameters: transport.dtlsParameters,
//   };
//   callback(params);
// };

// const connectProducerTransport = async (data, callback, socket, router) => {
//   console.log("connectProducerTransport", data);
//   const transport = producers.get(data.transportId);
//   if (!transport) {
//     callback({ error: "transport not found" });
//     return;
//   }
//   await transport.connect({ dtlsParameters: data.dtlsParameters });
//   console.log("conneted transport");
// };

// const connectConsumerTransport = async (data, callback, socket, router) => {
//   console.log("connect consumer Transport", data);
//   const transport = consumers.get(data.transportId);
//   if (!transport) {
//     callback({ error: "transport not found" });
//     return;
//   }
//   await transport.connect({ dtlsParameters: data.dtlsParameters });
//   console.log("connected consumer transport");
// };

// const produceHandler = async (data, callback, socket, io, router) => {
//   console.log("produceHandler", data);
//   const transport = producers.get(data.transportId);
//   if (!transport) {
//     callback({ error: "transport not found" });
//     return;
//   }

//   const producer = await transport.produce({
//     kind: data.kind,
//     rtpParameters: data.rtpParameters,
//   });
//   callback({ id: producer.id });
// };

// const joinRoomHandler = (data, callback, socket, io, router) => {
//   const { identity, roomId } = data;

//   if (rooms.has(roomId)) {
//     const newUser = {
//       identity: identity,
//       socketId: socket.id,
//       roomId: roomId,
//     };
//     socket.join(roomId);
//     connectedUsers.push(newUser);

//     console.log("connected user after join", connectedUsers);

//     rooms.get(roomId).peers.set(socket.id, {
//       socketId: socket.id,
//       identity: identity,
//       producers: null,
//       consumers: new Map(),
//     });
//     console.log("room after join", rooms.get(roomId));

//     callback({ roomId: roomId });
//   }
// };

const createRoom = async (data, socketId, worker) => {
  // check if create room have this id or not
  let router1;
  let peers = [];
  if ("roomId" in data) {
    // means room exist then add this peer to given room
    let roomId = data.roomId;
    router1 = rooms[roomId].router;
    peers = rooms[roomId].peers || [];
    rooms[roomId] = {
      router: router1,
      peers: [...peers, socketId],
    };

    return { roomId, router1 };
  } else {
    // not exist then create room and router
    let generateRoomId = uuidv4();
    router1 = await worker.createRouter({ mediaCodecs });

    rooms[generateRoomId] = {
      router: router1,
      peers: [...peers, socketId],
    };
    return { roomId: generateRoomId, router1 };
  }
};

const joinRoomHandler = async (data, callback, socket, worker, io) => {
  const { roomId, router1 } = await createRoom(data, socket.id, worker);

  peers[socket.id] = {
    socket,
    roomId,
    transports: [],
    producers: [],
    consumers: [],
    peerDetails: {
      name: "",
      isAdmin: false, // Is this Peer the Admin?
    },
  };

  const rtpCapabilities = router1.rtpCapabilities;
  socket.join(roomId);
  callback({ roomId, rtpCapabilities });
  io.to(roomId).emit("room-update", { peers: rooms[roomId].peers });
};

const createWebRtcTransport = async (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      const webRtcOptions = {
        listenIps: [{ ip: "127.0.0.1", announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      };

      let transport = await router.createWebRtcTransport(webRtcOptions);
      transport.on("dtlsstatechange", (dtlsState) => {
        if (dtlsState === "closed") {
          transport.close();
        }
      });

      transport.on("close", () => {
        console.log("transport closed");
      });
      resolve(transport);
    } catch (err) {
      reject(err);
    }
  });
};

const addTransport = (transport, roomId, consumer, socket) => {
  transports = [
    ...transports,
    { socketId: socket.id, transport, roomId, consumer },
  ];
  peers[socket.id] = {
    ...peers[socket.id],
    transports: [...peers[socket.id].transports, transport.id],
  };
};

const createWebRTCTransportHandler = async (
  consumer,
  callback,
  socket,
  worker
) => {
  const roomId = peers[socket.id].roomId;
  const router = rooms[roomId].router;
  createWebRtcTransport(router).then((transport) => {
    callback({
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    });

    addTransport(transport, roomId, consumer, socket);
  }).catch = (err) => {
    console.log(err);
  };
};

const getTransport = (socketId) => {
  const [producerTransport] = transports.filter(
    (transport) => transport.socketId === socketId && !transport.consumer
  );
  return producerTransport.transport;
};

const connectWebRTCTransportHandler = async (
  dtlsParameters,
  socket,
  worker
) => {
  // get the transport using socket id and connectproducer

  console.log("connectWebRTCTransportHandler");

  getTransport(socket.id).connect({ dtlsParameters });
};

const addProducer = (producer, roomId, socket) => {
  producers = [...producers, { socketId: socket.id, producer, roomId }];

  peers[socket.id] = {
    ...peers[socket.id],
    producers: [...peers[socket.id].producers, producer.id],
  };
  console.log("peers", peers);
};

const informConsumers = (roomId, socketId, producerId) => {
  // emit new producer to each consumer
  console.log("inform consumers triggered consumers", consumers);
  console.log("inform consumers triggered producers", producers);
  // here instead of producer we should send consumer the new feed
  console.log("peers", peers);
  producers.forEach((producer) => {
    if (producer.socketId !== socketId && producer.roomId === roomId) {
      const producerSocket = peers[producer.socketId].socket;

      producerSocket.emit("new-producer", { producerId: producerId });
    }
  });
};

const transportProduceHandler = async (
  kind,
  rtpParameters,
  appData,
  callback,
  socket,
  worker,
  io
) => {
  // get producer of this socket id
  const producer = await getTransport(socket.id).produce({
    kind,
    rtpParameters,
  });
  const { roomId } = peers[socket.id];

  const getWEBrtcTransport = getTransport(socket.id);

  getWEBrtcTransport.on("dtlsstatechange", (dtlsState) => {
    if (dtlsState === "connected") {
      console.log("dtlsstatechange connected", getWEBrtcTransport.tuple);
      console.log(
        "dtlsstatechange connected",
        getWEBrtcTransport.iceSelectedTuple
      );
    }
  });

  addProducer(producer, roomId, socket); // add into producer list

  // informConsumers(roomId, socket.id, producer.id); // inform all consumers about new producer

  // emit that new-producer started liek someone started his video streaming and do not send the stream to the original user who initiated the request
  socket.broadcast.to(roomId).emit("new-producer", { producerId: producer.id });

  producer.on("transportclose", () => {
    producer.close();
  });
  callback({
    id: producer.id,
    // producersExist: producers.length > 1 ? true : false,
    producerExist: producers.length >= 1 ? true : false, // required if some new user joins and already some of the user are producing the stream
  });
};

const getProducersHandler = (callback, socket, worker) => {
  console.log("get producer handler", producers);
  const { roomId } = peers[socket.id];
  let producersList = [];
  // sent back the producer by getting from producers list from peers

  producers.forEach((producer) => {
    if (producer.socketId !== socket.id && producer.roomId === roomId) {
      producersList = [...producersList, producer.producer.id];
    }
  });

  console.log("producers list", producersList);

  callback(producersList);
};

const transportRecvConnectHandler = async (
  dtlsParameters,
  serverConsumerTransportId,
  socket,
  worker
) => {
  // find the transport and check if that transport is consumer type
  const consumerTransport = transports.find(
    (transportData) =>
      transportData.consumer &&
      transportData.transport.id == serverConsumerTransportId
  ).transport;
  await consumerTransport.connect({ dtlsParameters });
};

const addConsumer = (consumer, roomId, socket) => {
  consumers = [...consumers, { socketId: socket.id, consumer, roomId }];
  peers[socket.id] = {
    ...peers[socket.id],
    consumers: [...peers[socket.id].consumers, consumer.id],
  };
};

const consumeHander = async (
  rtpCapabilities,
  remoteProducerId,
  serverConsumerTransportId,
  callback,
  socket,
  worker
) => {
  try {
    const { roomId } = peers[socket.id];
    const router = rooms[roomId].router;
    let consumerTransport = transports.find(
      (transport) =>
        transport.consumer &&
        transport.transport.id === serverConsumerTransportId
    ).transport;
    if (router.canConsume({ producerId: remoteProducerId, rtpCapabilities })) {
      // transport can consume and return a consumer
      const consumer = await consumerTransport.consume({
        producerId: remoteProducerId,
        rtpCapabilities,
        paused: true,
      });

      // on transport close
      consumer.on("transportclose", () => {});
      // on producer close
      consumer.on("producerclose", () => {
        socket.emit("producer-closed", { remoteProducerId });

        consumerTransport.close([]);
        transports = transports.filter(
          (transportData) => transportData.transport.id !== consumerTransport.id
        );
        consumer.close();
        consumers = consumers.filter(
          (consumerData) => consumerData.consumer.id !== consumer.id
        );
      });

      addConsumer(consumer, roomId, socket);
      const params = {
        id: consumer.id,
        producerId: remoteProducerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        serverConsumerId: consumer.id,
      };
      callback({ params });
    }
  } catch (err) {
    callback({ params: { error: err } });
  }
};

const serverConsumerResumeHandler = async (
  serverConsumerId,
  socket,
  worker
) => {
  const { consumer } = consumers.find(
    (consumer) => consumer.consumer.id === serverConsumerId
  );
  await consumer.resume();
};

const removeItems = (items, socketId, type) => {
  items.forEach((item) => {
    if (item.socketId === socketId) {
      item[type].close();
    }
  });
  items = items.filter((item) => item.socketId !== socketId);
  return items;
};

const disconnectHandler = async (socket, worker, io) => {
  console.log("disconnecting socket", socket.id);
  // clean up functions
  consumers = removeItems(consumers, socket.id, "consumer");
  producers = removeItems(producers, socket.id, "producer");

  transports = removeItems(transports, socket.id, "transport");
  if (socket.id in peers) {
    const { roomId } = peers[socket.id];
    delete peers[socket.id];

    rooms[roomId] = {
      router: rooms[roomId].router,
      peers: rooms[roomId].peers.filter((socketId) => socketId !== socket.id),
    };
    if (rooms[roomId].peers.length === 0) {
      delete rooms[roomId];
      socket.leave(roomId);
    } else {
      socket.leave(roomId);
      io.to(roomId).emit("room-update", {
        peers: rooms[roomId].peers,
      });
      // io.to(roomId).emit("peer-disconnected", {
      //   producerId: producers.producer.id,
      // });
    }
  }
};

// chat module

const chatMessageHandler = async (msg, socket, worker, io) => {
  const { roomId } = peers[socket.id];
  io.to(roomId).emit("get-chat-msg", { msg: msg });
};

// start recording

const startRecordingHandler = async (data, socket, worker, io) => {
  const { producerId } = data;

  const producerExist = producers.find((obj) => obj.producer.id === producerId);

  if (producerToRecordingMap[data] || !producerExist) {
    return;
  } else {
    // const producerTransport = transports.find((transport) =>
    //   transport.transport.getProducerById(producerId)
    // );
    const { router } = rooms[peers[socket.id].roomId];
    const webRtcOptions = {
      listenIp: { ip: "0.0.0.0", announcedIp: "127.0.0.1" },
      rtcpMux: false,
      comedia: false,
    };

    // const producerTransport = await router.createWebRtcTransport(webRtcOptions);

    const plainTransport = await router.createPlainTransport(webRtcOptions);

    // console.log("rtpConsumer", plainTransport.tuple);

    let remoteRTPPort = 5006;
    let remoteRTCPPort = 5007;

    // await plainTransport.connect();

    await plainTransport.connect({
      ip: "127.0.0.1",
      port: remoteRTPPort,
      rtcpPort: remoteRTCPPort,
    });

    const rtpConsumer = await plainTransport.consume({
      producerId: producerId,
      rtpCapabilities: router.rtpCapabilities,
    });

    const videoCodecInfo = getCodecInfoFromRtpParameters(
      "video",
      rtpConsumer.rtpParameters
    );

    const outputPath = path.join(
      uploadFolder,
      `${producerId}-${Date.now()}.webm`
    );

    // const args = [
    //   "-e",
    //   "-v",
    //   "fdsrc",
    //   "!",
    //   "videoconvert",
    //   "!",
    //   "x264enc",
    //   "!",
    //   "mp4mux",
    //   "!",
    //   `filesink location=${outputPath}`,
    // ];

    // const gstreamerProcess = spawn("gst-launch-1.0", args);
    // rtpConsumer.on("rtp", ({ rtpPacket }) => {
    //   gstreamerProcess.stdin.write(rtpPacket);
    // });

    // gstreamerProcess.on("error", (error) => {
    //   console.error("GStreamer process error:", error);
    // });

    // gstreamerProcess.on("exit", (code, signal) => {
    //   console.log("GStreamer process exited with code:", code);
    // });

    let sdpString = `v=0
    o=- 0 0 IN IP4 127.0.0.1
    s=FFmpeg
    c=IN IP4 127.0.0.1
    t=0 0
    m=video 5006 RTP/AVP ${videoCodecInfo.payloadType}
    a=rtcp:5007
    a=rtpmap:${videoCodecInfo.payloadType} ${videoCodecInfo.codecName}/${videoCodecInfo.clockRate}
    `;

    // const { localIp, localPort, remotePort } = plainTransport.tuple;

    //   const sdpOffer = `
    //   v=0
    //   o=- 0 0 IN IP4 ${localIp}
    //   s=FFmpeg
    //   c=IN IP4 ${localIp}
    //   t=0 0
    //   m=video ${remotePort} RTP/AVP ${
    //     rtpConsumer.rtpParameters.codecs[0].payloadType
    //   }
    //   ${rtpConsumer.rtpParameters.codecs
    //     .map(
    //       (codec) =>
    //         `a=rtpmap:${codec.payloadType} ${codec.mimeType.replace(
    //           `${"video"}/`,
    //           ""
    //         )}/${codec.clockRate}`
    //     )
    //     .join("\n")}
    // `;

    //   console.log("sdpOffer", sdpOffer);
    //   const inputSDPFile = path.join(__dirname, "../sdpstrings/input-h264.sdp");

    const tmpSdpFile = path.join(__dirname, "../sdpstrings/tmp-sdp.sdp");
    fs.writeFileSync(tmpSdpFile, sdpString);

    const args = [
      "-loglevel",
      "trace",
      "-protocol_whitelist",
      "pipe,file,crypto,udp,rtp",
      "-fflags",
      "+genpts",
      "-analyzeduration",
      "20000000",
      "-probesize",
      "20000000",
      "-f",
      "sdp",
      "-i",
      tmpSdpFile,
      "-map",
      "0:v:0",
      "-c:v",
      "copy",
      "-max_delay",
      "100000",
      "-y",
      outputPath,
    ];
    const recordingProcess = spawn("ffmpeg", args);

    recordingProcess.stdin.write(sdpString);

    rtpConsumer.on("rtp", (rtpPacket) => {
      recordingProcess.stdin.write(rtpPacket);
    });

    recordingProcess.stdin.on("data", (data) => {
      console.log("getting data", data);
    });
    recordingProcess.on("close", (code) => {
      recordingProcess.stdin.end();
      console.log(`FFmpeg process exited with code ${code}`);
      // Add further handling for completion of the recording process here
    });

    // Handle the error event to log any errors from FFmpeg
    recordingProcess.stderr.on("data", (data) => {
      console.error(`FFmpeg stderr data: ${data}`);
    });
    // await rtpConsumer.resume();
  }
};

const pollHandler = (data, socket) => {
  socket.broadcast.emit("recv-poll", data);
};

module.exports = {
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
};
