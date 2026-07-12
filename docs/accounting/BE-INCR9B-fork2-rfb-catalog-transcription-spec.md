# BE-INCR-9B — Fork 2: transcrição B0 do Plano de Contas Referencial oficial da RFB

**Status:** preparação (2026-07-11). NÃO é código; é a spec do passo **B0** que o `referentialCatalog.ts`
declara explicitamente ser transcrição humana contra o arquivo oficial — "this parser INVENTS NOTHING …
mapping the official RFB layout INTO this contract is the FASE-2 transcription step (B0), done by a human".

**Relação com o resto:** o *mecanismo* do Track B (model `ReferentialAccount`, import idempotente por
versão, validação analytic-only de destino D3) está implementado e revisado (commit `348c32c`, reviewer PASS).
Este Fork 2 é **dado externo** — não bloqueia review/merge do mecanismo; bloqueia apenas **ligar a validação
num tenant real**, porque sem catálogo importado a validação cai no fallback free-string (INCR-9). Fork 1 já
foi decidido: **catálogo único compartilhado ECD/ECF** (uma tabela por `layoutVersion`, sem discriminador de
leiaute).

---

## 1. Contrato de destino (o que o parser do Track B espera) — VERIFICADO no código

`server/src/lib/referentialCatalog.ts` (`REQUIRED_CATALOG_COLS`) exige uma tabela de **colunas nomeadas**
(header na 1ª linha), não posicional:

| Coluna neutra | Obrigatória? | Tipo aceito | Observação |
|---|---|---|---|
| `code` | sim | string | código referencial da RFB, byte-a-byte do arquivo oficial |
| `name` | sim | string | descrição oficial |
| `isAnalytic` | sim | **só `true` / `false` / `1` / `0`** | `parseAnalytic` rejeita qualquer outro token → erro de linha |
| `parentCode` | não | string | conta sintética superior; ausente → `null` |

- `layoutVersion` **NÃO é coluna** — é o parâmetro do request de import (o humano declara qual leiaute/ano; D7).
- Código duplicado no arquivo = erro de linha → import é **all-or-nothing** (catálogo parcial nunca existe).
- Linha totalmente vazia é pulada em silêncio (trailing de export de planilha).

**Consequência dura para a transcrição:** o arquivo oficial marca o tipo como **`S`/`A`** (ver §3); o parser
**não** aceita `S`/`A`. A conversão `A → true`, `S → false` é justamente o coração do passo B0 (fork 9B-4).

---

## 2. Fonte oficial — VERIFICADO

- Portal: **http://sped.rfb.gov.br/** → "Tabelas Dinâmicas e Planos de Contas Referenciais", publicado
  **por leiaute e por ano-calendário** (ex.: Leiaute 6, 9, 11…). Índice de manuais: `pasta/show/1644`.
- Também vem embutido na instalação do **PVA** (Programa Validador) em
  `…\Programas SPED\SpedContabil\recursos\tabelas` (ECD) e equivalente do ECF.
- **Versões distintas por tipo de entidade:** *PJ em Geral*, *Instituições Financeiras*, *Seguradoras*,
  *Imunes e Isentas*. **Para este projeto (salão, Lucro Presumido) use "PJ em Geral".** ⚠️ A linha-amostra que
  consegui na pesquisa (`3.1.8.2.1.91.00 VARIAÇÕES DAS PROVISÕES TÉCNICAS - PREVIDÊNCIA…`) é de **seguradora/
  previdência** — NÃO importe essa tabela; ela existe só para ilustrar o leiaute posicional abaixo.

---

## 3. Leiaute posicional do arquivo oficial — VERIFICADO por 1 linha-amostra, a CONFIRMAR contra o header real

Separador de campo: **pipe `|`**. Linha-amostra real (doc Senior F043RFB), decodificada campo a campo:

```
3.1.8.2.1.91.00 | VARIAÇÕES DAS PROVISÕES TÉCNICAS - PREVIDÊNCIA COM | 01012020 | 31122020 | 539 | S | 3.1.8.2.1.00.00 | 6 | 04
      (1)                          (2)                                    (3)        (4)     (5) (6)        (7)          (8) (9)
```

| # | Campo oficial | → coluna neutra | Regra |
|---|---|---|---|
| 1 | Código referencial (hierárquico, separado por ponto) | `code` | cópia literal |
| 2 | Descrição | `name` | cópia literal |
| 3 | Data início validade `DDMMAAAA` | — | filtra por ano-calendário alvo (§5) |
| 4 | Data fim validade `DDMMAAAA` | — | idem |
| 5 | Id/ordem interno | — | descartar |
| 6 | **Tipo: `S`=Sintética / `A`=Analítica** | `isAnalytic` | **`A`→`true`, `S`→`false`** (fork 9B-4) |
| 7 | Conta sintética superior | `parentCode` | cópia literal; raiz → vazio → `null` |
| 8 | Nível hierárquico | — | descartar (derivável do código) |
| 9 | Grupo/natureza | — | descartar |

> **Grau de evidência:** a EXISTÊNCIA e semântica dos campos (código, descrição, `S`/`A`, conta superior,
> validade) estão **verificadas** em múltiplas fontes de ERP. A **ordem posicional exata e a contagem de
> campos podem variar** entre a tabela do ECD e a do ECF e entre versões de leiaute. **O humano confirma a
> ordem lendo o header/manual do arquivo baixado antes de rodar o conversor** — o conversor deixa os índices
> de coluna configuráveis exatamente por isso (D1/D10: não se inventa nem se assume a posição do dado fiscal).

**Importar sintéticas também?** SIM. O import carrega **todas** as linhas (S e A), com `isAnalytic` por
linha. Só analíticas são destino válido do de-para (D3), mas as sintéticas precisam existir no catálogo para
(a) a mensagem de erro precisa "código X é sintético" (vs. "código X não existe") e (b) o `parentCode` do
picker/árvore resolver. Isto casa com o gate implementado: catálogo presente + código sintético →
`ValidationError`; código ausente → outra `ValidationError`.

---

## 4. Conversor B0 (reshape puro — zero código RFB hardcoded)

`server/scripts/rfb-referential-to-catalog.mjs` — lê o arquivo pipe oficial e emite o CSV de colunas neutras
que o endpoint de import consome. Ele **não contém nenhum código de conta**: só recorta colunas e traduz
`S`/`A`→boolean. Índices de coluna são **parâmetros** (default = o leiaute observado no §3), e há um
self-check na linha-amostra que falha se a decodificação quebrar.

```
node server/scripts/rfb-referential-to-catalog.mjs \
  --in  "PLANO_REFERENCIAL_PJ_EM_GERAL_2024.txt" \
  --out "catalog-pj-geral-2024.csv" \
  --year 2024                 # filtra por validade (campo 3/4); omitir = todas as linhas
# índices default: --code 0 --name 1 --tipo 5 --parent 6 --ini 2 --fim 3
```

Depois: subir `catalog-pj-geral-2024.csv` no endpoint `POST /accounting/referential/catalog/import` com
`layoutVersion` = a versão que casa com o `mappingVersion` usado no de-para (ex.: `"2024"`). Confirme que o
`parseTable` do INCR-6 aceita CSV; se ele só aceitar XLSX, abra o CSV numa planilha e salve no formato que o
import espera (as colunas nomeadas são as mesmas).

---

## 5. Decisões/dados que AINDA precisam de você (não são chutáveis)

1. **Arquivo-fonte exato:** baixar o "PJ em Geral" do ano-calendário alvo do portal SPED (ou do PVA). Qual
   ano-calendário é o primeiro a ligar? Isso define o valor de `layoutVersion` do 1º import.
2. **Confirmar a ordem posicional** (§3) contra o header/manual do arquivo baixado — e ajustar os índices do
   conversor se divergir. Grau atual: 1 linha-amostra, de tabela de seguradora.
3. **D7 na prática:** confirmar que a tabela referencial do ECD e a do ECF do mesmo ano são o **mesmo**
   conjunto de códigos (a decisão de catálogo único assume isto). Se a RFB publicar dois arquivos referenciais
   distintos para ECD vs ECF no mesmo ano, o "catálogo único" precisa de um `layoutVersion` que os reconcilie
   — reabrir Fork 1 nesse caso.
4. **Copyright/redistribuição:** o conteúdo é dado público da RFB; o import é ato do usuário (upload do
   arquivo que ele baixou). Não versionar o arquivo oficial no repo — ele entra por upload em runtime, como
   qualquer dado de tenant.

---

## 6. Checklist de ligação (quando você tiver o arquivo)

- [ ] Baixar "PJ em Geral" do ano-calendário alvo (portal SPED ou PVA `recursos/tabelas`).
- [ ] Conferir header/ordem posicional vs §3; ajustar índices do conversor se preciso.
- [ ] `node server/scripts/rfb-referential-to-catalog.mjs …` → CSV neutro (self-check passa).
- [ ] `POST /accounting/referential/catalog/import` com `layoutVersion` = versão do de-para.
- [ ] `GET /accounting/referential/catalog` confirma contagem (sintéticas + analíticas) e amostragem.
- [ ] Refazer um de-para com código **sintético** → esperar `ValidationError` "é sintético" (prova D3 viva).
- [ ] Refazer com código **analítico** válido → esperar sucesso + `label` snapshot do catálogo.
```
