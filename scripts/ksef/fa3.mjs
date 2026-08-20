const NS = "http://crd.gov.pl/wzor/2025/06/25/13775/";
const money = (n) => n.toFixed(2);

/** Buduje fakturę FA(3) zgodną ze schematem `schemat_FA(3)_v1-0E.xsd`. */
export function buildFa3({ seller, buyer, number, issueDate, dueDate, place, lines, bankAccount }) {
  const net = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const vat = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice * (l.vatRate / 100), 0);
  const gross = net + vat;

  // Podmiot2 (nabywca) ma w schemacie FA(3) obowiązkowy blok dodatkowy —
  // samo DaneIdentyfikacyjne + Adres to za mało (błąd 450).
  const party = (p, tag, extra = "") => `	<${tag}>
		<DaneIdentyfikacyjne>
			<NIP>${p.nip}</NIP>
			<Nazwa>${escapeXml(p.name)}</Nazwa>
		</DaneIdentyfikacyjne>
		<Adres>
			<KodKraju>PL</KodKraju>
			<AdresL1>${escapeXml(p.street)}</AdresL1>
			<AdresL2>${p.post} ${escapeXml(p.city)}</AdresL2>
		</Adres>${extra}
	</${tag}>`;

  const rows = lines
    .map(
      (l, index) => `		<FaWiersz>
			<NrWierszaFa>${index + 1}</NrWierszaFa>
			<P_7>${escapeXml(l.name)}</P_7>
			<P_8A>${l.unit}</P_8A>
			<P_8B>${l.quantity.toFixed(2)}</P_8B>
			<P_9A>${money(l.unitPrice)}</P_9A>
			<P_11>${money(l.quantity * l.unitPrice)}</P_11>
			<P_12>${l.vatRate}</P_12>
		</FaWiersz>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="${NS}">
	<Naglowek>
		<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
		<WariantFormularza>3</WariantFormularza>
		<DataWytworzeniaFa>${issueDate}T09:00:00Z</DataWytworzeniaFa>
		<SystemInfo>LexAlpha / Gumijagoda</SystemInfo>
	</Naglowek>
${party(seller, "Podmiot1")}
${party(buyer, "Podmiot2", "\n\t\t<JST>2</JST>\n\t\t<GV>2</GV>")}
	<Fa>
		<KodWaluty>PLN</KodWaluty>
		<P_1>${issueDate}</P_1>
		<P_1M>${escapeXml(seller.city)}</P_1M>
		<P_2>${number}</P_2>
		<P_13_1>${money(net)}</P_13_1>
		<P_14_1>${money(vat)}</P_14_1>
		<P_15>${money(gross)}</P_15>
		<Adnotacje>
			<P_16>2</P_16>
			<P_17>2</P_17>
			<P_18>2</P_18>
			<P_18A>2</P_18A>
			<Zwolnienie><P_19N>1</P_19N></Zwolnienie>
			<NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>
			<P_23>2</P_23>
			<PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>
		</Adnotacje>
		<RodzajFaktury>VAT</RodzajFaktury>
${rows}
		<Platnosc>
			<TerminPlatnosci><Termin>${dueDate}</Termin></TerminPlatnosci>
			<FormaPlatnosci>6</FormaPlatnosci>
			<RachunekBankowy>
				<NrRB>${bankAccount}</NrRB>
			</RachunekBankowy>
		</Platnosc>
	</Fa>
</Faktura>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[ch]);
}
