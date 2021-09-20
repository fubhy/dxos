//
// Copyright 2019 DXOS.org
//

/* eslint-disable jest/no-done-callback */

import assert from 'assert';
import hypercore from 'hypercore';
import hypertrie from 'hypertrie';
import pify from 'pify';
import tempy from 'tempy';

import { sleep } from '@dxos/async';
import { PublicKey, createKeyPair } from '@dxos/crypto';
import { IStorage, STORAGE_NODE, STORAGE_RAM, createStorage } from '@dxos/random-access-multi-storage';

import { FeedDescriptor } from './feed-descriptor';
import { FeedStore } from './feed-store';
import { HypercoreFeed } from './hypercore-types';

interface KeyPair {
  key: PublicKey,
  secretKey: Buffer
}

const feedNames = ['booksFeed', 'usersFeed', 'groupsFeed'];

const createFeedStore = (storage: IStorage, options = {}) => {
  const feedStore = new FeedStore(storage, options);
  return feedStore;
};

async function createDefault () {
  const directory = tempy.directory();

  return {
    directory,
    feedStore: createFeedStore(createStorage(directory, STORAGE_NODE), { valueEncoding: 'utf-8' })
  };
}

async function defaultFeeds (feedStore: FeedStore, keys: Record<string, KeyPair>) : Promise<Record<string, FeedDescriptor>> {
  return Object.fromEntries(await Promise.all(Object.entries<KeyPair>(keys).map(async ([feed, keyPair]) =>
    [feed, await feedStore.openReadWriteFeed(keyPair.key, keyPair.secretKey)]
  )));
}

function append (feed: HypercoreFeed, message: any) {
  return pify(feed.append.bind(feed))(message);
}

function head (feed: HypercoreFeed) {
  return pify(feed.head.bind(feed))();
}

const createKeyPairs = () => {
  return Object.fromEntries<KeyPair>(feedNames.map(feed => {
    const { publicKey, secretKey } = createKeyPair();
    return [feed, { key: PublicKey.from(publicKey), secretKey }];
  }));
};

describe('FeedStore', () => {
  const keys = createKeyPairs();

  test('Config default', async () => {
    const feedStore = await createFeedStore(createStorage('', STORAGE_RAM));
    expect(feedStore).toBeInstanceOf(FeedStore);

    const feedStore2 = new FeedStore(createStorage('', STORAGE_RAM));
    expect(feedStore2).toBeInstanceOf(FeedStore);
  });

  test('Config default + custom database + custom hypercore', async () => {
    const customHypercore = jest.fn((...args) => {
      return hypercore(args[0], args[1], args[2]);
    });

    const storage = createStorage('', STORAGE_RAM);
    const database = hypertrie(storage.createOrOpen.bind(storage), { valueEncoding: 'json' });
    database.list = jest.fn((_, cb) => cb(null, []));

    const feedStore = createFeedStore(createStorage('', STORAGE_RAM), {
      hypercore: customHypercore
    });

    expect(feedStore).toBeInstanceOf(FeedStore);

    await feedStore.openReadOnlyFeed(PublicKey.random());

    expect(customHypercore.mock.calls.length).toBe(1);
  });

  test('Create feed', async () => {
    const { feedStore } = await createDefault();
    const { booksFeed: { feed: booksFeed } } = await defaultFeeds(feedStore, keys);

    expect(booksFeed).toBeInstanceOf(hypercore);

    const booksFeedDescriptor = await feedStore.openReadWriteFeed(PublicKey.from(booksFeed.key), booksFeed.secretKey);
    expect(booksFeedDescriptor).toHaveProperty('key', PublicKey.from(booksFeed.key));

    await append(booksFeed, 'Foundation and Empire');
    await expect(head(booksFeed)).resolves.toBe('Foundation and Empire');

    // It should return the same opened instance.
    await expect(feedStore.openReadOnlyFeed(PublicKey.from(booksFeed.key))).resolves.toBe(booksFeedDescriptor);
  });

  test('Create duplicate feed', async () => {
    const { feedStore } = await createDefault();

    const { feed: fds } = await feedStore.openReadWriteFeed(keys.usersFeed.key, keys.usersFeed.secretKey);
    assert(fds.secretKey);

    const [usersFeed, feed2] = await Promise.all([
      feedStore.openReadWriteFeed(PublicKey.from(fds.key), fds.secretKey),
      feedStore.openReadWriteFeed(PublicKey.from(fds.key), fds.secretKey)
    ]);
    expect(usersFeed.feed).toBe(feed2.feed);

    await append(usersFeed.feed, 'alice');
    await expect(head(usersFeed.feed)).resolves.toBe('alice');
  });

  test('Create and close a feed', async () => {
    const { feedStore } = await createDefault();
    const publicKey = PublicKey.random();

    const foo = await feedStore.openReadOnlyFeed(publicKey);
    expect(foo.opened).toBeTruthy();

    await feedStore.close();
    expect(foo.opened).toBeFalsy();
  });

  test('Descriptors', async () => {
    const { feedStore } = await createDefault();
    await defaultFeeds(feedStore, keys);

    expect(Array.from((feedStore as any)._descriptors.values()).map((fd: any) => fd.key))
      .toEqual(Object.entries(keys).map(([, keyPair]) => keyPair.key)
      );
  });

  test('Feeds', async () => {
    const { feedStore } = await createDefault();
    const { booksFeed, usersFeed, groupsFeed } = await defaultFeeds(feedStore, keys);

    expect(Array.from((feedStore as any)._descriptors.values()).map((fd: any) => fd.key))
      .toEqual([booksFeed.key, usersFeed.key, groupsFeed.key]);
  });

  test('Close feedStore and their feeds', async () => {
    const { feedStore } = await createDefault();
    await defaultFeeds(feedStore, keys);

    expect(Array.from((feedStore as any)._descriptors.values()).map((fd: any) => fd.key).length).toBe(3);
    await feedStore.close();
    expect(Array.from((feedStore as any)._descriptors.values()).map((fd: any) => fd.key).length).toBe(0);
  });

  test('Default codec: binary', async () => {
    const feedStore = createFeedStore(createStorage('', STORAGE_RAM));
    expect(feedStore).toBeInstanceOf(FeedStore);

    const { publicKey, secretKey } = createKeyPair();
    const { feed } = await feedStore.openReadWriteFeed(PublicKey.from(publicKey), secretKey);
    expect(feed).toBeInstanceOf(hypercore);
    await append(feed, 'test');
    await expect(head(feed)).resolves.toBeInstanceOf(Buffer);
  });

  test('on close error should unlock the descriptor', async () => {
    const feedStore = createFeedStore(createStorage('', STORAGE_RAM), {
      hypercore: () => ({
        opened: true,
        ready (cb: () => void) {
          cb();
        },
        on () {},
        close () {
          throw new Error('close error');
        }
      })
    });

    const publicKey = PublicKey.random();
    await feedStore.openReadOnlyFeed(publicKey);

    await expect(feedStore.close()).rejects.toThrow(/close error/);
  });

  test('feed event does not get called twice', async () => {
    const { feedStore } = await createDefault();

    let timesCalled = 0;
    feedStore.feedOpenedEvent.on(() => {
      timesCalled++;
    });

    const key = PublicKey.random();
    await feedStore.openReadOnlyFeed(key);

    await feedStore.openReadOnlyFeed(key);
    await feedStore.openReadOnlyFeed(key);
    await feedStore.openReadOnlyFeed(key);

    await sleep(20); // To flush events

    expect(timesCalled).toEqual(1);
  });
});
