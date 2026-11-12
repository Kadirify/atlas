import { describe, expect, it } from 'vitest'
import { classifySql, stripSql } from '@shared/sql'

const kind = (sql: string): string => classifySql(sql).kind

describe('classifySql: okuma', () => {
  it('düz SELECT ve WITH ... SELECT onaysız okunur', () => {
    expect(kind('SELECT TOP 10 * FROM dbo.Personel WHERE Ad = N\'Ali\'')).toBe('read')
    expect(kind('  select count(*) from siparis;  ')).toBe('read')
    expect(kind('WITH x AS (SELECT 1 AS a) SELECT * FROM x')).toBe('read')
    expect(kind('-- açıklama\nSELECT 1')).toBe('read')
  })

  it('metin sabitinin ya da tırnaklı adın içindeki kelimeler karar değiştirmez', () => {
    expect(kind("SELECT 'DROP TABLE x; DELETE FROM y' AS metin")).toBe('read')
    expect(kind('SELECT [Delete], "update" FROM [Drop Kayıtları]')).toBe('read')
    expect(kind("SELECT 'it''s; delete' FROM t")).toBe('read')
  })
})

describe('classifySql: onay isteyen', () => {
  it('ekleme, güncelleme ve yapı değişiklikleri onay ister', () => {
    expect(kind("INSERT INTO t (a) VALUES (1)")).toBe('write')
    expect(kind("UPDATE t SET a = 1 WHERE id = 5")).toBe('write')
    expect(kind('CREATE TABLE yeni (id int)')).toBe('write')
    expect(kind('ALTER TABLE t ADD kolon int')).toBe('write')
    expect(kind('EXEC dbo.sp_Rapor @yil = 2026')).toBe('write')
    expect(kind('MERGE hedef USING kaynak ON 1=1 WHEN MATCHED THEN UPDATE SET a = 1;')).toBe('write')
  })

  it('SELECT gibi başlayıp yazan sorgular okuma sayılmaz', () => {
    expect(kind('SELECT * INTO yedek FROM t')).toBe('write')
    expect(kind('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).toBe('write')
    expect(kind('SELECT 1; SELECT 2')).toBe('write')
    expect(kind("SELECT * FROM OPENROWSET('SQLNCLI', 'x', 'y')")).toBe('write')
    expect(kind('')).toBe('write')
    expect(kind('SHOW TABLES')).toBe('write')
  })
})

describe('classifySql: yasak', () => {
  it('silme ve yok etme işlemleri hiçbir biçimde çalıştırılmaz', () => {
    expect(kind('DELETE FROM t WHERE id = 1')).toBe('forbidden')
    expect(kind('drop table t')).toBe('forbidden')
    expect(kind('TRUNCATE TABLE t')).toBe('forbidden')
    expect(kind('ALTER TABLE t DROP COLUMN a')).toBe('forbidden')
    expect(kind('DROP DATABASE uretim')).toBe('forbidden')
  })

  it('başka bir ifadenin arkasına ya da içine gizlenmiş silme de yakalanır', () => {
    expect(kind('SELECT 1; DELETE FROM t')).toBe('forbidden')
    expect(kind('WITH x AS (SELECT 1) DELETE FROM t')).toBe('forbidden')
    expect(kind('MERGE h USING k ON 1=1 WHEN NOT MATCHED BY SOURCE THEN DELETE;')).toBe('forbidden')
    expect(kind('SELECT 1 /* yorum */ ; /* a */ DrOp /* b */ TABLE t')).toBe('forbidden')
    expect(kind("UPDATE t SET a = 1; -- masum\nDELETE FROM t")).toBe('forbidden')
    expect(classifySql('DELETE FROM a; DROP TABLE b').keywords.sort()).toEqual(['DELETE', 'DROP'])
  })
})

describe('stripSql', () => {
  it('yorumları ve metinleri çıkarır, iç içe yorumu doğru kapatır', () => {
    expect(stripSql('SELECT /* a /* b */ c */ 1').replace(/\s+/g, ' ').trim()).toBe('SELECT 1')
    expect(stripSql("SELECT 'a' -- son").replace(/\s+/g, ' ').trim()).toBe('SELECT x')
    expect(stripSql('SELECT $$ drop $$').replace(/\s+/g, ' ').trim()).toBe('SELECT x')
  })

  it('kapanmamış metin sabiti kalan her şeyi yutar; gizli ifade çalışan kısımda kalamaz', () => {
    expect(stripSql("SELECT 'açık kaldı; DELETE FROM t").replace(/\s+/g, ' ').trim()).toBe('SELECT x')
  })
})
