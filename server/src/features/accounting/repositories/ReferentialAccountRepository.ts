import prisma from '../../../lib/prisma';
import type { ReferentialAccount, Prisma } from 'generated/prisma';
import type {
  IReferentialAccountRepository,
  ReferentialAccountInput,
  ReferentialCatalogQuery,
} from './IReferentialAccountRepository';

/**
 * Prisma-backed repository for the RFB referential CATALOG (`referential_accounts`).
 * Only place with prisma.referentialAccount.* access. GLOBAL reference data — NO
 * AccountingScope (the official layout is the same for every tenant — D4). No soft-delete:
 * re-import upserts in place on the @@unique[layoutVersion,code].
 */
export class ReferentialAccountRepository implements IReferentialAccountRepository {
  public async upsert(
    data: ReferentialAccountInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialAccount> {
    return (tx ?? prisma).referentialAccount.upsert({
      where: { layoutVersion_code: { layoutVersion: data.layoutVersion, code: data.code } },
      // update-in-place on re-import: refresh the name/analytic flag/parent from the file.
      update: {
        name: data.name,
        isAnalytic: data.isAnalytic,
        parentCode: data.parentCode,
      },
      create: {
        layoutVersion: data.layoutVersion,
        code: data.code,
        name: data.name,
        isAnalytic: data.isAnalytic,
        parentCode: data.parentCode,
      },
    });
  }

  public async findByVersionAndCode(
    layoutVersion: string,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialAccount | null> {
    return (tx ?? prisma).referentialAccount.findUnique({
      where: { layoutVersion_code: { layoutVersion, code } },
    });
  }

  public async countByVersion(
    layoutVersion: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return (tx ?? prisma).referentialAccount.count({ where: { layoutVersion } });
  }

  public async findManyByVersion(
    layoutVersion: string,
    query?: ReferentialCatalogQuery,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialAccount[]> {
    const where: Prisma.ReferentialAccountWhereInput = { layoutVersion };
    if (query?.analyticOnly) where.isAnalytic = true;
    if (query?.q) {
      where.OR = [{ code: { contains: query.q } }, { name: { contains: query.q } }];
    }
    return (tx ?? prisma).referentialAccount.findMany({
      where,
      orderBy: { code: 'asc' },
    });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
