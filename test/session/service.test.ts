/* eslint-env mocha */
import { expect } from "chai";
import Multiaddr = require("multiaddr");

import { createKeypair, KeypairType } from "../../src/keypair";
import { ENR } from "../../src/enr";
import { createMagic, createWhoAreYouPacket, Packet, PacketType } from "../../src/packet";
import { UDPTransportService } from "../../src/transport";
import { SessionService } from "../../src/session";
import { createFindNodeMessage } from "../../src/message";

describe("session service", () => {
  const kp0 = createKeypair(
    KeypairType.secp256k1,
    Buffer.from("a93bedf04784c937059557c9dcb328f5f59fdb6e89295c30e918579250b7b01f", "hex"),
    Buffer.from("022663242e1092ea19e6bb41d67aa69850541a623b94bbea840ddceaab39789894", "hex"),
  );
  const kp1 = createKeypair(
    KeypairType.secp256k1,
    Buffer.from("bd04e55f2a1424a4e69e96aad41cf763d2468d4358472e9f851569bdf47fb24c", "hex"),
    Buffer.from("03eae9945b354e9212566bc3f2740f3a62b3e1eb227dbed809f6dc2d3ea848c82e", "hex"),
  );

  const addr0 = Multiaddr("/ip4/127.0.0.1/udp/49020");
  const addr1 = Multiaddr("/ip4/127.0.0.1/udp/49021");

  const enr0 = ENR.createV4(kp0.publicKey);
  const enr1 = ENR.createV4(kp1.publicKey);

  enr0.multiaddrUDP = addr0;
  enr1.multiaddrUDP = addr1;

  const magic0 = createMagic(enr0.nodeId);
  const magic1 = createMagic(enr1.nodeId);

  let transport0: UDPTransportService;
  let transport1: UDPTransportService;

  let service0: SessionService;
  let service1: SessionService;

  beforeEach(async () => {
    transport0 = new UDPTransportService(addr0, magic0);
    transport1 = new UDPTransportService(addr1, magic1);

    service0 = new SessionService(enr0, kp0, transport0);
    service1 = new SessionService(enr1, kp1, transport1);

    await service0.start();
    await service1.start();
  });

  afterEach(async () => {
    await service0.stop();
    await service1.stop();
  });

  it("should negotiate a session and receive a message from a cold sender (a->RandomPacket -> b->WhoAreYou -> a->AuthMessage)", async () => {
    const receivedRandom = new Promise(resolve => transport1.once("packet", (sender: Multiaddr, data: Packet) => {
      expect(sender.toString()).to.equal(addr0.toString());
      expect(data.type).to.equal(PacketType.Message);
      resolve();
    }));
    const receivedWhoAreYou = new Promise(resolve => transport0.once("packet", (sender: Multiaddr, data: Packet) => {
      expect(sender.toString()).to.equal(addr1.toString());
      expect(data.type).to.equal(PacketType.WhoAreYou);
      resolve();
    }));
    // send a who are you when requested
    service1.on("whoAreYouRequest", (srcId, src, authTag) => {
      service1.sendWhoAreYou(src, srcId, BigInt(0), enr0, authTag);
    });
    const establishedSession = new Promise(resolve => service1.once("established", (enr) => {
      expect(enr).to.deep.equal(enr0);
      resolve();
    }));
    const receivedMsg = new Promise(resolve => service1.once("message", (srcId, src, message) => {
      resolve();
    }));
    service0.sendRequest(enr1, createFindNodeMessage(0));
    await Promise.all([
      receivedRandom,
      receivedWhoAreYou,
      establishedSession,
      receivedMsg,
    ]);
  });
  it("receiver should drop WhoAreYou packets from destinations without existing pending requests", async () => {
    transport0.send(addr1, createWhoAreYouPacket(enr1.nodeId, Buffer.alloc(12), BigInt(0)));
    transport0.on("packet", () => expect.fail("transport0 should not receive any packets"))
  });
  it("should only accept WhoAreYou packets from destinations with existing pending requests", async () => {
  });
});
