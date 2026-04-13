import { describe, it, expect } from 'vitest';
import { Snowflake, configureSnowflake, nextSnowflakeId } from '../src/id/snowflake';

describe('Snowflake ID Generator', () => {
  it('should generate unique string IDs', () => {
    const sf = new Snowflake();
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(sf.nextId());
    }
    expect(ids.size).toBe(1000);
  });

  it('should generate monotonically increasing IDs', () => {
    const sf = new Snowflake();
    let prev = BigInt(sf.nextId());
    for (let i = 0; i < 100; i++) {
      const curr = BigInt(sf.nextId());
      expect(curr).toBeGreaterThan(prev);
      prev = curr;
    }
  });

  it('should respect datacenterId and workerId', () => {
    const sf1 = new Snowflake({ datacenterId: 1, workerId: 1 });
    const sf2 = new Snowflake({ datacenterId: 2, workerId: 2 });
    const id1 = sf1.nextId();
    const id2 = sf2.nextId();
    expect(id1).not.toBe(id2);
  });

  it('should throw on invalid datacenterId', () => {
    expect(() => new Snowflake({ datacenterId: 32 })).toThrow('datacenterId');
    expect(() => new Snowflake({ datacenterId: -1 })).toThrow('datacenterId');
  });

  it('should throw on invalid workerId', () => {
    expect(() => new Snowflake({ workerId: 32 })).toThrow('workerId');
    expect(() => new Snowflake({ workerId: -1 })).toThrow('workerId');
  });

  it('should generate IDs as strings (not lose precision)', () => {
    const sf = new Snowflake();
    const id = sf.nextId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    // 应该是纯数字字符串
    expect(/^\d+$/.test(id)).toBe(true);
  });

  it('should handle high concurrency within same millisecond', () => {
    const sf = new Snowflake();
    const ids = new Set<string>();
    // 快速生成 4096+ 个 ID（超过单毫秒序列号上限）
    for (let i = 0; i < 5000; i++) {
      ids.add(sf.nextId());
    }
    expect(ids.size).toBe(5000);
  });

  it('nextSnowflakeId should use global instance', () => {
    configureSnowflake({ datacenterId: 5, workerId: 10 });
    const id = nextSnowflakeId();
    expect(typeof id).toBe('string');
    expect(/^\d+$/.test(id)).toBe(true);
  });

  it('should support custom epoch', () => {
    const sf = new Snowflake({ epoch: Date.now() - 1000 });
    const id = sf.nextId();
    expect(typeof id).toBe('string');
    // 使用近期 epoch，生成的 ID 应该比较小
    expect(BigInt(id)).toBeGreaterThan(0n);
  });
});
