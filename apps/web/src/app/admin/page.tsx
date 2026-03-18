import { requireAdminUser } from "@/lib/access";

type TileTone = "high" | "mid" | "low" | "blank";

const regionTiles: Array<{
  code: string;
  value: string;
  tone: TileTone;
  col: number;
  row: number;
}> = [
  { code: "МУРМ", value: "21", tone: "low", col: 4, row: 1 },
  { code: "СПБ", value: "281", tone: "high", col: 2, row: 2 },
  { code: "КАРЕЛ", value: "52", tone: "mid", col: 3, row: 2 },
  { code: "КАЛИН", value: "28", tone: "low", col: 0, row: 3 },
  { code: "ЛЕНИН", value: "64", tone: "mid", col: 2, row: 3 },
  { code: "НОВГ", value: "35", tone: "low", col: 3, row: 3 },
  { code: "ВОЛОГ", value: "44", tone: "low", col: 4, row: 3 },
  { code: "НЕНЦ", value: "4", tone: "low", col: 8, row: 2 },
  { code: "АРХАН", value: "40", tone: "low", col: 7, row: 3 },
  { code: "КОМИ", value: "50", tone: "low", col: 8, row: 3 },
  { code: "ЯНАО", value: "27", tone: "low", col: 9, row: 3 },
  { code: "КРАСН", value: "131", tone: "high", col: 12, row: 3 },
  { code: "ЧУКОТ", value: "", tone: "blank", col: 15, row: 2 },
  { code: "ЯКУТИЯ", value: "24", tone: "low", col: 14, row: 3 },
  { code: "МАГАД", value: "5", tone: "low", col: 15, row: 3 },
  { code: "КАМЧ", value: "14", tone: "low", col: 16, row: 3 },
  { code: "ПСКОВ", value: "47", tone: "low", col: 2, row: 4 },
  { code: "ТВЕРЬ", value: "86", tone: "mid", col: 3, row: 4 },
  { code: "ЯРОСЛ", value: "25", tone: "low", col: 4, row: 4 },
  { code: "ИВАН", value: "50", tone: "low", col: 5, row: 4 },
  { code: "КОСТР", value: "48", tone: "low", col: 6, row: 4 },
  { code: "МАРИ", value: "28", tone: "low", col: 7, row: 4 },
  { code: "КИРОВ", value: "27", tone: "low", col: 8, row: 4 },
  { code: "ПЕРМ", value: "82", tone: "high", col: 9, row: 4 },
  { code: "ХМАО", value: "104", tone: "high", col: 10, row: 4 },
  { code: "ТЮМЕН", value: "24", tone: "low", col: 11, row: 4 },
  { code: "ТОМСК", value: "54", tone: "mid", col: 12, row: 4 },
  { code: "КЕМЕР", value: "57", tone: "mid", col: 13, row: 4 },
  { code: "ИРКУТ", value: "184", tone: "high", col: 14, row: 4 },
  { code: "АМУР", value: "22", tone: "low", col: 15, row: 4 },
  { code: "ХАБАР", value: "72", tone: "mid", col: 16, row: 4 },
  { code: "СМОЛ", value: "20", tone: "low", col: 1, row: 5 },
  { code: "КАЛУЖ", value: "46", tone: "low", col: 2, row: 5 },
  { code: "МОСКОВ", value: "484", tone: "high", col: 3, row: 5 },
  { code: "МСК", value: "548", tone: "high", col: 4, row: 5 },
  { code: "ВЛАД", value: "64", tone: "mid", col: 5, row: 5 },
  { code: "НИЖЕГ", value: "165", tone: "high", col: 6, row: 5 },
  { code: "ЧУВАШ", value: "53", tone: "mid", col: 7, row: 5 },
  { code: "ТАТАР", value: "179", tone: "high", col: 8, row: 5 },
  { code: "УДМУР", value: "70", tone: "mid", col: 9, row: 5 },
  { code: "СВЕРДЛ", value: "276", tone: "high", col: 10, row: 5 },
  { code: "КУРГАН", value: "37", tone: "low", col: 11, row: 5 },
  { code: "НОВОС", value: "156", tone: "high", col: 12, row: 5 },
  { code: "ХАКАС", value: "27", tone: "low", col: 13, row: 5 },
  { code: "БУРЯТ", value: "50", tone: "low", col: 14, row: 5 },
  { code: "ЕВР", value: "6", tone: "low", col: 15, row: 5 },
  { code: "ПРИМОР", value: "99", tone: "high", col: 16, row: 5 },
  { code: "БРЯНС", value: "60", tone: "mid", col: 2, row: 6 },
  { code: "ОРЛОВ", value: "38", tone: "low", col: 3, row: 6 },
  { code: "ТУЛЬС", value: "55", tone: "mid", col: 4, row: 6 },
  { code: "РЯЗАН", value: "61", tone: "mid", col: 5, row: 6 },
  { code: "МОРД", value: "36", tone: "low", col: 6, row: 6 },
  { code: "УЛЬЯН", value: "68", tone: "mid", col: 7, row: 6 },
  { code: "САМАР", value: "119", tone: "high", col: 8, row: 6 },
  { code: "БАШК", value: "205", tone: "high", col: 9, row: 6 },
  { code: "ЧЕЛЯБ", value: "94", tone: "high", col: 10, row: 6 },
  { code: "ОМСК", value: "154", tone: "high", col: 11, row: 6 },
  { code: "АЛТ.К", value: "136", tone: "high", col: 12, row: 6 },
  { code: "ТЫВА", value: "36", tone: "low", col: 13, row: 6 },
  { code: "ЗАБАЙК", value: "52", tone: "mid", col: 14, row: 6 },
  { code: "ЛНР", value: "", tone: "blank", col: 2, row: 7 },
  { code: "КУРСК", value: "47", tone: "low", col: 3, row: 7 },
  { code: "ЛИПЕЦ", value: "27", tone: "low", col: 4, row: 7 },
  { code: "ТАМБОВ", value: "26", tone: "low", col: 5, row: 7 },
  { code: "ПЕНЗ", value: "81", tone: "mid", col: 6, row: 7 },
  { code: "САРАТОВ", value: "136", tone: "high", col: 7, row: 7 },
  { code: "ОРЕНБ", value: "57", tone: "mid", col: 8, row: 7 },
  { code: "АЛТАЙ", value: "25", tone: "low", col: 12, row: 7 },
  { code: "ХЕРС", value: "", tone: "blank", col: 1, row: 8 },
  { code: "ЗАПР", value: "", tone: "blank", col: 2, row: 8 },
  { code: "ДНР", value: "", tone: "blank", col: 3, row: 8 },
  { code: "БЕЛГОР", value: "64", tone: "mid", col: 4, row: 8 },
  { code: "ВОРОН", value: "68", tone: "mid", col: 5, row: 8 },
  { code: "ВОЛГО", value: "127", tone: "high", col: 6, row: 8 },
  { code: "КРЫМ", value: "86", tone: "mid", col: 2, row: 9 },
  { code: "АДЫГ", value: "27", tone: "low", col: 3, row: 9 },
  { code: "КР.КР", value: "264", tone: "high", col: 4, row: 9 },
  { code: "РОСТОВ", value: "157", tone: "high", col: 5, row: 9 },
  { code: "КАЛМ", value: "5", tone: "low", col: 6, row: 9 },
  { code: "АСТРАХ", value: "66", tone: "mid", col: 7, row: 9 },
  { code: "СЕВАСТ", value: "22", tone: "low", col: 2, row: 10 },
  { code: "КЧР", value: "17", tone: "low", col: 4, row: 10 },
  { code: "СТАВР", value: "116", tone: "high", col: 5, row: 10 },
  { code: "ЧЕЧНЯ", value: "106", tone: "high", col: 6, row: 10 },
  { code: "ДАГЕС", value: "129", tone: "high", col: 7, row: 10 },
  { code: "КБР", value: "51", tone: "mid", col: 4, row: 11 },
  { code: "АЛАНИЯ", value: "31", tone: "low", col: 5, row: 11 },
  { code: "ИНГУШ", value: "15", tone: "low", col: 6, row: 11 },
  { code: "САХАЛН", value: "12", tone: "low", col: 17, row: 7 },
];

function getTileClasses(tone: TileTone) {
  switch (tone) {
    case "high":
      return "border-[#9ec58b] bg-[#6e9262] text-white";
    case "mid":
      return "border-[#d3b075] bg-[#d9ad5a] text-slate-950";
    case "blank":
      return "border-slate-300 bg-white text-slate-500";
    case "low":
    default:
      return "border-[#93686a] bg-[#8b5053] text-white";
  }
}

export default async function AdminPage() {
  await requireAdminUser();

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-[#1f67ab] p-3 shadow-[0_18px_40px_rgba(31,103,171,0.18)]">
        <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr_200px_180px]">
          <select className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none">
            <option>Данные по РФ</option>
            <option>Центральный федеральный округ</option>
            <option>Субъект РФ</option>
          </select>
          <select className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none">
            <option>Число коек хирургических для детей</option>
            <option>Обеспеченность койками</option>
            <option>Количество операторов</option>
          </select>
          <select className="h-14 rounded-2xl border-0 bg-white px-5 text-[15px] font-medium text-slate-800 outline-none">
            <option>2024</option>
            <option>2023</option>
            <option>2022</option>
          </select>
          <button className="h-14 rounded-2xl bg-[#3d84c7] px-6 text-sm font-semibold text-white transition hover:bg-[#3378ba]">
            Применить
          </button>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Данные по РФ</h1>

        <div className="mt-8 overflow-x-auto pb-2">
          <div
            className="grid min-w-[1180px] gap-1.5"
            style={{
              gridTemplateColumns: "repeat(18, minmax(0, 58px))",
              gridAutoRows: "58px",
            }}
          >
            {regionTiles.map((tile) => (
              <div
                key={`${tile.code}-${tile.col}-${tile.row}`}
                className={`flex flex-col items-center justify-center rounded-[6px] border text-center shadow-sm ${getTileClasses(tile.tone)}`}
                style={{
                  gridColumnStart: tile.col + 1,
                  gridRowStart: tile.row,
                }}
              >
                <span className="text-[11px] font-semibold uppercase leading-none">{tile.code}</span>
                <span className="mt-1 text-sm font-semibold leading-none">{tile.value || "\u00A0"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
