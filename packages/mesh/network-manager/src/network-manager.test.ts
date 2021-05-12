//
// Copyright 2020 DXOS.org
//

import debug from 'debug';
import { expect, mockFn } from 'earljs';
import waitForExpect from 'wait-for-expect';

import { PublicKey } from '@dxos/crypto';
import { Protocol } from '@dxos/protocol';
import { Event, latch, sleep, range } from '@dxos/util';

import { NetworkManager } from './network-manager';
import { TestProtocolPlugin, testProtocolProvider } from './testing/test-protocol';
import { FullyConnectedTopology } from './topology/fully-connected-topology';
import { StarTopology } from './topology/star-topology';
import { Topology } from './topology/topology';

const log = debug('dxos:network-manager:test');

interface CreatePeerOptions {
  topic: PublicKey
  peerId: PublicKey
  inMemory?: boolean
  topology?: Topology
  signal?: string[]
  ice?: any
}

describe('Network manager', () => {
  const createPeer = async ({
    topic,
    peerId,
    inMemory,
    topology = new FullyConnectedTopology(),
    signal = !inMemory ? ['wss://apollo1.kube.moon.dxos.network/dxos/signal'] : undefined,
    ice
  }: CreatePeerOptions) => {
    const networkManager = new NetworkManager({ signal, ice });

    const plugin = new TestProtocolPlugin(peerId.asBuffer());
    const protocolProvider = testProtocolProvider(topic.asBuffer(), peerId.asBuffer(), plugin);
    networkManager.joinProtocolSwarm({ topic, peerId, protocol: protocolProvider, topology });

    return {
      networkManager,
      plugin
    };
  };

  test.skip('two peers connect to each other', async () => {
    const topic = PublicKey.random();
    const peer1Id = PublicKey.random();
    const peer2Id = PublicKey.random();

    const { plugin: plugin1, networkManager: nm1 } = await createPeer({ topic, peerId: peer1Id });
    const { plugin: plugin2, networkManager: nm2 } = await createPeer({ topic, peerId: peer2Id });

    const mockReceive = mockFn<[Protocol, string]>().returns(undefined);
    plugin1.on('receive', mockReceive);

    plugin2.on('connect', async () => {
      plugin2.send(peer1Id.asBuffer(), 'Foo');
    });

    await waitForExpect(() => {
      expect(mockReceive).toHaveBeenCalledWith([expect.a(Protocol), 'Foo']);
    });

    await nm1.destroy();
    await nm2.destroy();
  }, 10_000);

  test('join and leave swarm', async () => {
    const topic = PublicKey.random();
    const peer1Id = PublicKey.random();
    const peer2Id = PublicKey.random();

    const { networkManager: networkManager1, plugin: plugin1 } = await createPeer({ topic, peerId: peer1Id });
    const { networkManager: networkManager2, plugin: plugin2 } = await createPeer({ topic, peerId: peer2Id });

    await Promise.all([
      Event.wrap(plugin1, 'connect').waitForCount(1),
      Event.wrap(plugin2, 'connect').waitForCount(1)
    ]);

    log('Connected');

    const promise1 = Event.wrap(plugin1, 'disconnect').waitForCount(1);
    const promise2 = Event.wrap(plugin2, 'disconnect').waitForCount(1);

    await networkManager1.leaveProtocolSwarm(topic);

    await promise1;

    log('Peer1 disconnected');

    await promise2;

    log('Peer2 disconnected');

    await networkManager1.destroy();
    log('Peer1 destroyed');
    await networkManager2.destroy();
    log('Peer2 destroyed');
  }, 10_000);

  it.skip('two peers with different signal & turn servers', async () => {
    const topic = PublicKey.random();
    const peer1Id = PublicKey.random();
    const peer2Id = PublicKey.random();

    const { networkManager: networkManager1, plugin: plugin1 } = await createPeer({ topic, peerId: peer1Id, signal: ['wss://apollo1.kube.moon.dxos.network/dxos/signal'], ice: [{ urls: 'turn:apollo1.kube.moon.dxos.network:3478', username: 'dxos', credential: 'dxos' }] });
    await sleep(3000);
    const { networkManager: networkManager2, plugin: plugin2 } = await createPeer({ topic, peerId: peer2Id, signal: ['wss://apollo2.kube.moon.dxos.network/dxos/signal'], ice: [{ urls: 'turn:apollo2.kube.moon.dxos.network:3478', username: 'dxos', credential: 'dxos' }] });

    const mockReceive = mockFn<[Protocol, string]>().returns(undefined);
    plugin1.on('receive', mockReceive);

    plugin2.on('connect', async () => {
      plugin2.send(peer1Id.asBuffer(), 'Foo');
    });

    await waitForExpect(() => {
      expect(mockReceive).toHaveBeenCalledWith([expect.a(Protocol), 'Foo']);
    });

    await networkManager1.destroy();
    await networkManager2.destroy();
  }, 10_000);

  describe('StarTopology', () => {
    test.skip('two peers connect to each other', async () => {
      const topic = PublicKey.random();
      const peer1Id = PublicKey.random();
      const peer2Id = PublicKey.random();

      const { plugin: plugin1 } = await createPeer({ topic, peerId: peer1Id, topology: new StarTopology(peer1Id) });
      const { plugin: plugin2 } = await createPeer({ topic, peerId: peer2Id, topology: new StarTopology(peer1Id) });

      const mockReceive = mockFn<[Protocol, string]>().returns(undefined);
      plugin1.on('receive', mockReceive);

      plugin2.on('connect', async () => {
        plugin2.send(peer1Id.asBuffer(), 'Foo');
      });

      await waitForExpect(() => {
        expect(mockReceive).toHaveBeenCalledWith([expect.a(Protocol), 'Foo']);
      });
    }, 10_000);
  });

  describe('in-memory', () => {
    test.skip('two peers connect to each other', async () => {
      const topic = PublicKey.random();
      const peer1Id = PublicKey.random();
      const peer2Id = PublicKey.random();

      const { networkManager: nm1, plugin: plugin1 } = await createPeer({ topic, peerId: peer1Id, inMemory: true });
      const { networkManager: nm2, plugin: plugin2 } = await createPeer({ topic, peerId: peer2Id, inMemory: true });

      const mockReceive = mockFn<[Protocol, string]>().returns(undefined);
      plugin1.on('receive', mockReceive);

      plugin2.on('connect', async () => {
        plugin2.send(peer1Id.asBuffer(), 'Foo');
      });

      await waitForExpect(() => {
        expect(mockReceive).toHaveBeenCalledWith([expect.a(Protocol), 'Foo']);
      });

      nm1.destroy();
      nm2.destroy();
    }, 10_000);

    test('two swarms at the same time', async () => {
      const topicA = PublicKey.random();
      const topicB = PublicKey.random();
      const peerA1Id = PublicKey.random();
      const peerA2Id = PublicKey.random();
      const peerB1Id = PublicKey.random();
      const peerB2Id = PublicKey.random();

      const { plugin: pluginA1 } = await createPeer({ topic: topicA, peerId: peerA1Id, inMemory: true });
      const { plugin: pluginA2 } = await createPeer({ topic: topicA, peerId: peerA2Id, inMemory: true });
      const { plugin: pluginB1 } = await createPeer({ topic: topicB, peerId: peerB1Id, inMemory: true });
      const { plugin: pluginB2 } = await createPeer({ topic: topicB, peerId: peerB2Id, inMemory: true });

      const mockReceiveA = mockFn<[Protocol, string]>().returns(undefined);
      pluginA1.on('receive', mockReceiveA);
      const mockReceiveB = mockFn<[Protocol, string]>().returns(undefined);
      pluginB1.on('receive', mockReceiveB);

      pluginA2.on('connect', async () => {
        pluginA2.send(peerA1Id.asBuffer(), 'Foo A');
      });
      pluginB2.on('connect', async () => {
        pluginB2.send(peerB1Id.asBuffer(), 'Foo B');
      });

      await waitForExpect(() => {
        expect(mockReceiveA).toHaveBeenCalledWith([expect.a(Protocol), 'Foo A']);
        expect(mockReceiveB).toHaveBeenCalledWith([expect.a(Protocol), 'Foo B']);
      });
    });

    test('large amount of peers and connections', async () => {
      const numTopics = 5;
      const peersPerTopic = 5;

      await Promise.all(range(numTopics).map(async () => {
        const topic = PublicKey.random();

        await Promise.all(range(peersPerTopic).map(async () => {
          const peerId = PublicKey.random();
          const { plugin } = await createPeer({ topic, peerId, inMemory: true });

          const [done, pongReceived] = latch(peersPerTopic - 1);

          plugin.on('connect', async (protocol: Protocol) => {
            const remoteId = PublicKey.from(protocol.getSession().peerId);

            plugin.send(remoteId.asBuffer(), 'ping');
          });

          plugin.on('receive', (protocol, data) => {
            const remoteId = PublicKey.from(protocol.getSession().peerId);

            if (data === 'ping') {
              plugin.send(remoteId.asBuffer(), 'pong');
            } else if (data === 'pong') {
              pongReceived();
            } else {
              throw new Error(`Invalid message: ${data}`);
            }
          });

          await done;
        }));
      }));
    });
  });
});
