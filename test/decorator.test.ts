import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { Table, Column, Id, getEntityMeta, camelToSnake } from '../src/decorator';

describe('Decorator', () => {
  describe('camelToSnake', () => {
    it('converts camelCase to snake_case', () => {
      expect(camelToSnake('userName')).toBe('user_name');
      expect(camelToSnake('createdAt')).toBe('created_at');
      expect(camelToSnake('id')).toBe('id');
      expect(camelToSnake('HTMLParser')).toBe('_h_t_m_l_parser');
    });
  });

  describe('@Table + @Column + @Id', () => {
    @Table('sys_user')
    class User {
      @Id({ type: 'auto' })
      id!: number;

      @Column('user_name')
      userName!: string;

      @Column()
      age!: number;

      @Column({ name: 'email_addr' })
      email!: string;

      @Column({ exist: false })
      fullName!: string;
    }

    const meta = getEntityMeta(User);

    it('sets table name', () => {
      expect(meta.tableName).toBe('sys_user');
    });

    it('collects all columns', () => {
      expect(meta.columns).toHaveLength(5);
    });

    it('sets id column', () => {
      expect(meta.idColumn).not.toBeNull();
      expect(meta.idColumn!.propertyName).toBe('id');
      expect(meta.idColumn!.isPrimary).toBe(true);
      expect(meta.idColumn!.idType).toBe('auto');
    });

    it('maps column name from @Column(string)', () => {
      const col = meta.columns.find(c => c.propertyName === 'userName');
      expect(col!.columnName).toBe('user_name');
    });

    it('auto converts camelCase when no name specified', () => {
      const col = meta.columns.find(c => c.propertyName === 'age');
      expect(col!.columnName).toBe('age');
    });

    it('maps column name from @Column({ name })', () => {
      const col = meta.columns.find(c => c.propertyName === 'email');
      expect(col!.columnName).toBe('email_addr');
    });

    it('marks non-exist column', () => {
      const col = meta.columns.find(c => c.propertyName === 'fullName');
      expect(col!.exist).toBe(false);
    });

    it('exist columns default to true', () => {
      const col = meta.columns.find(c => c.propertyName === 'age');
      expect(col!.exist).toBe(true);
    });
  });

  describe('getEntityMeta error', () => {
    it('throws when no @Table decorator', () => {
      class NoDecorator {}
      expect(() => getEntityMeta(NoDecorator)).toThrow('No entity metadata');
    });
  });
});
