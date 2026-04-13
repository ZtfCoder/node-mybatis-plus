/**
 * 雪花算法 ID 生成器（Twitter Snowflake）
 *
 * 64 位结构：
 * - 1 bit：符号位（始终为 0）
 * - 41 bit：时间戳差值（毫秒），可用约 69 年
 * - 5 bit：数据中心 ID（0-31）
 * - 5 bit：工作机器 ID（0-31）
 * - 12 bit：序列号（0-4095，同毫秒内自增）
 *
 * 生成的 ID 为 bigint 类型，转为 string 返回（避免 JS number 精度丢失）
 */

const EPOCH = 1704067200000n; // 2024-01-01 00:00:00 UTC
const DATACENTER_BITS = 5n;
const WORKER_BITS = 5n;
const SEQUENCE_BITS = 12n;

const MAX_DATACENTER_ID = (1n << DATACENTER_BITS) - 1n; // 31
const MAX_WORKER_ID = (1n << WORKER_BITS) - 1n;         // 31
const MAX_SEQUENCE = (1n << SEQUENCE_BITS) - 1n;         // 4095

const WORKER_SHIFT = SEQUENCE_BITS;                      // 12
const DATACENTER_SHIFT = SEQUENCE_BITS + WORKER_BITS;    // 17
const TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_BITS + DATACENTER_BITS; // 22

export interface SnowflakeOptions {
  datacenterId?: number;
  workerId?: number;
  epoch?: number;
}

export class Snowflake {
  private datacenterId: bigint;
  private workerId: bigint;
  private epoch: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(options?: SnowflakeOptions) {
    const dc = BigInt(options?.datacenterId ?? 0);
    const wk = BigInt(options?.workerId ?? 0);
    if (dc < 0n || dc > MAX_DATACENTER_ID) {
      throw new Error(`datacenterId must be between 0 and ${MAX_DATACENTER_ID}`);
    }
    if (wk < 0n || wk > MAX_WORKER_ID) {
      throw new Error(`workerId must be between 0 and ${MAX_WORKER_ID}`);
    }
    this.datacenterId = dc;
    this.workerId = wk;
    this.epoch = options?.epoch ? BigInt(options.epoch) : EPOCH;
  }

  nextId(): string {
    let timestamp = BigInt(Date.now());

    if (timestamp < this.lastTimestamp) {
      throw new Error(`Clock moved backwards. Refusing to generate id for ${this.lastTimestamp - timestamp}ms`);
    }

    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & MAX_SEQUENCE;
      if (this.sequence === 0n) {
        // 当前毫秒序列号用完，等待下一毫秒
        timestamp = this.waitNextMillis(this.lastTimestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = timestamp;

    const id =
      ((timestamp - this.epoch) << TIMESTAMP_SHIFT) |
      (this.datacenterId << DATACENTER_SHIFT) |
      (this.workerId << WORKER_SHIFT) |
      this.sequence;

    return id.toString();
  }

  private waitNextMillis(lastTimestamp: bigint): bigint {
    let timestamp = BigInt(Date.now());
    while (timestamp <= lastTimestamp) {
      timestamp = BigInt(Date.now());
    }
    return timestamp;
  }
}

// 默认全局实例
let defaultInstance: Snowflake | null = null;

/**
 * 配置全局雪花算法实例
 */
export function configureSnowflake(options: SnowflakeOptions): void {
  defaultInstance = new Snowflake(options);
}

/**
 * 获取全局雪花算法实例（未配置时使用默认参数）
 */
export function getSnowflake(): Snowflake {
  if (!defaultInstance) {
    defaultInstance = new Snowflake();
  }
  return defaultInstance;
}

/**
 * 生成一个雪花 ID
 */
export function nextSnowflakeId(): string {
  return getSnowflake().nextId();
}
