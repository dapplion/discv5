import {KademliaRoutingTable, xorDist, xorDistCmp} from "../../src/kademlia/kademlia";
import { expect } from "chai";
import {ENR, v4} from "../../src/enr";

describe("Kademlia xor function", () => {
  it("should throw an error if the 2 byte arrays are of different size", () => {
    expect(() => xorDist(Buffer.from("abc"), Buffer.from("abcd"))).throw("arrays are of different lengths");
  });

  it("should return zero if passed the same values", () => {
    expect(xorDist(Buffer.from("abc"), Buffer.from("abc"))).eq(0);
  });

  it("should return a distance of 1 if there is just one bit of difference", () => {
    expect(xorDist(Buffer.from([1]), Buffer.from([0]))).eq(1);
  });

  it("should return a distance of 16 as xor of vs 0xff", () => {
    const a = Buffer.from([0x0f, 0x0f, 0x0f, 0x0f]);
    const b = Buffer.from([0xf0, 0xf0, 0xf0, 0xf0]);
    expect(xorDist(a, b)).eq(32);
  });
});

describe("Kademlia xorDistCmp function", () => {
  it("should throw an error if the byte arrays are of different size", () => {
    expect(() => xorDistCmp(Buffer.from("abc"), Buffer.from("abc"), Buffer.from("abcd"))).throw("arrays are of different lengths");
  });
  it("should compare distances", () => {
    expect( xorDistCmp(Buffer.from("0"), Buffer.from("1"), Buffer.from("2"))).to.eq(-1);
    expect( xorDistCmp(Buffer.from("0"), Buffer.from("2"), Buffer.from("1"))).to.eq(1);
    expect( xorDistCmp(Buffer.from("0"), Buffer.from("5"), Buffer.from("5"))).to.eq(0);
  });
});

describe("Kademlia routing table",  () => {
  it("should throw an error if the self ID is empty", () => {
    expect(() => new KademliaRoutingTable<ENR>(Buffer.of(), 2,
      (enr: ENR) => Buffer.from(enr.id))).throw("selfId cannot be empty");
  });
  it("should throw an error if the number of buckets is zero", () => {
    expect(() => new KademliaRoutingTable<ENR>(Buffer.of(1,2,3), 0,
      (enr: ENR) => Buffer.from(enr.id))).throw("k must be positive");
  });
  it("should throw an error if the number of buckets is negative", () => {
    expect(() => new KademliaRoutingTable<ENR>(Buffer.of(1,2,3), -1,
      (enr: ENR) => Buffer.from(enr.id))).throw("k must be positive");
  });
  it("should return true when empty initially", () => {
    const table = new KademliaRoutingTable<ENR>(Buffer.of(1,2,3), 1,
      (enr: ENR) => Buffer.from(enr.id));
    expect(table.isEmpty()).to.be.true;
  });
  it("should return 0 when asked for size initially", () => {
    const table = new KademliaRoutingTable<ENR>(Buffer.of(1,2,3), 1,
      (enr: ENR) => Buffer.from(enr.id));
    expect(table.size).eq(0);
  });
  it("should add items", () => {
    const table = new KademliaRoutingTable<ENR>(ENR.createV4(v4.publicKey(v4.createPrivateKey())).nodeId, 1,
      (enr: ENR) => enr.nodeId);
    const sk = v4.createPrivateKey();
    table.add(ENR.createV4(v4.publicKey(sk)));
    expect(table.isEmpty()).to.be.false;
    expect(table.size).eq(1);
  });
  it("should propose eviction if bucket is full", () => {
    const table = new KademliaRoutingTable<string>(Buffer.from("1"), 2,
      (rec: string) => Buffer.from(rec), () => 0);
    table.add("2");
    table.add("3");
    expect(table.isEmpty()).eq(false);
    expect(table.size).eq(2);
    table.add("5");
    expect(table.has("2")).to.be.true;
    expect(table.has("3")).to.be.true;
    expect(table.has("5")).to.be.false;
    expect(table.size).eq(2);
  });
  it("should allow to add a value after evicting", () => {
    const table = new KademliaRoutingTable<string>(Buffer.from("1"), 2,
      (rec: string) => Buffer.from(rec), () => 0);
    expect(table.propose("2")).to.be.undefined;
    expect(table.propose("3")).to.be.undefined;
    expect(table.isEmpty()).eq(false);
    expect(table.size).eq(2);
    const oldValue = table.propose("5");
    expect(oldValue).to.eql("2");
    expect(table.size).eq(2);
    expect(table.evict("22")).to.be.false;
    expect(table.evict(oldValue!)).to.be.true;
    expect(table.propose("5")).to.be.undefined;
    expect(table.size).eq(2);
  });
  it("should clear values", () => {
    const table = new KademliaRoutingTable<string>(Buffer.from("1"), 2,
      (rec: string) => Buffer.from(rec));
    table.add("2");
    table.add("3");
    table.add("g");
    table.add("f");
    expect(table.size).to.eq(4);
    table.clear();
    expect(table.size).to.eq(0);
    expect(table.has("2")).to.be.false;
  });
  it("should provide nearest values", () => {
    const table = new KademliaRoutingTable<string>(Buffer.from("1"), 2,
      (rec: string) => Buffer.from(rec));
    table.add("2");
    table.add("3");
    table.add("g");
    table.add("f");
    expect(table.size).to.eq(4);
    expect(table.nearest("2", 2)).to.deep.eq(["2", "3"]);
    expect(table.nearest("g", 2)).to.deep.eq(["g", "f"]);
    expect(table.nearest("2", 4)).to.deep.eq(["2", "3", "f", "g"]);
  });
  it("should provide peers at a given distance", () => {
    const table = new KademliaRoutingTable<string>(Buffer.from("1"), 2,
      (rec: string) => Buffer.from(rec));
    table.add("2");
    table.add("3");
    table.add("g");
    table.add("f");
    expect(table.size).to.eq(4);
    expect(table.peersOfDistance(2)).to.deep.eq(["2", "3"]);
    expect(table.peersOfDistance(7)).to.deep.eq(["g", "f"]);
  });
  it("should provide peers at random", () => {
    const table = new KademliaRoutingTable<string>(Buffer.from("1"), 2,
      (rec: string) => Buffer.from(rec));
    table.add("2");
    table.add("3");
    table.add("g");
    table.add("f");
    expect(table.random()).to.be.oneOf(["2", "3", "g", "f"]);
  });
});