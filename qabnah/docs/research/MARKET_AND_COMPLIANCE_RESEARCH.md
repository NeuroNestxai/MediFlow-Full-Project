# Qabnah (قبناه): Market and Compliance Desk Research

**Prepared:** 2026-11-16. **Scope:** Saudi benchmarks, Oman legal and regulatory requirements, payments, messaging, and Muscat operations.
**Status:** Desk research only. It is **not legal advice**. Nothing here says Qabnah is compliant with anything. Every legal item is a requirement to **confirm with Omani counsel and the relevant regulator** before launch.

## How to read this document

| Label | Meaning |
|---|---|
| **VERIFIED** | Found on a primary or official source (government portal, gazette mirror, official developer docs, company or regulator site). Accessed 2026-11-16. See the access note below. |
| **REPORTED** | Found only in secondary sources: news outlets, law-firm briefings, vendor blogs, third-party code. |
| **UNVERIFIED / NEEDS LEGAL CONFIRMATION** | Not found, sources conflict, or the item comes from general background knowledge that was not re-checked in this session. |

**Access note (important).** The session's network allowlist blocked direct page fetches from most hosts, including omanobserver.om, muscatdaily.com, developer.thawani.om and thawani-technologies.stoplight.io. Where an item says VERIFIED, the content of the primary page came back through search-engine extracts of that page. The page itself was not opened and read in full. The one exception is the two Thawani client libraries, which were downloaded from npm and read line by line (see section 4). Before relying on any item, re-open the cited URL. Legal items must still go to counsel either way.

---

## 1. Saudi benchmark platforms

| Platform | Category | Monetisation (as reported) | Courier model | Notable for Qabnah |
|---|---|---|---|---|
| **HungerStation** (Delivery Hero) | Food, grocery, quick commerce | Restaurant commission plus delivery fees. Paid subscription (Pro/Plus), around SAR 19/month per trackers. "Plus" has passed 10M subscribers | Mixed fleet plus freelancers. Non-Saudis must work through licensed companies under TGA rules (see below) | Subscriptions at scale, multi-vertical |
| **Jahez** | Food (listed in Saudi). Also owns other brands | Commission take rate reportedly 13.5% (2023), 14.6% (2024), 15.4% (2025). Average delivery fee SAR 10.7 (FY2024). "Jahez Prime" subscription in Kuwait at KD 1/month | Freelance plus fleet | Started with a low-commission pitch to restaurants, now raising its take rate. Partnership with noon on quick commerce |
| **Mrsool** | "Anything" delivery, C2C errands | Courier bids on each request. Customer negotiates by chat | Crowd-sourced independent couriers (150k couriers reported in 2019) | Offer/negotiation model and free-text "get me anything" requests. Closest match to Qabnah's C2C use case |
| **Keeta** (Meituan) | Food | Launched with a low-commission pitch, heavy discounts, free delivery over SAR 25 | Not confirmed | Entered KSA Sept 2024 in Al Kharj (not Riyadh). Since added Qatar and Kuwait, and Bahrain is reported. **No confirmed Oman launch** |
| **Nana** | Grocery, dark stores | Retail margin plus delivery | Own fleet | Early dark-store pioneer, now reported to be going through financial restructuring |
| **Ninja** | Quick commerce | Own inventory in leased dark stores | Own rider fleet | Around 100 hubs in 28 cities (Feb 2025). Reported KSA quick-commerce leader |
| **The Chefz** | Specialty food, sweets, gifting | Marketplace | Not confirmed | Category specialist. Cooperation agreement with Nana |
| **ToYou** (Aram Meem) | Flexible, multi-merchant delivery | Marketplace | Not confirmed | 27,000+ merchants in 60+ cities. Super-app-style, does not run dark stores |
| **Careem (KSA)** | Rides, Bikes. Food and Quik reportedly paused | n/a | n/a | Reported wind-down of most consumer services in KSA except Rides and Bikes. A warning about multi-vertical cash burn |
| **Aramex / SMSA** | Parcel express | Per-shipment | Employed couriers | Aramex Oman has a web flow to send a domestic or international parcel, with OTP and cash or card payment. Not checked for SMSA |

**Sources and status**
- HungerStation Pro price (SAR 19/month): REPORTED. https://subger.com/en/service/hungerstation-extra-sa. Plus subscriber count: REPORTED. https://en.sharikatmubasher.com/media-hub/news/21489246/hungerstation-plus-surpasses-10mn-subscribers-100mn-orders?lang=en. Commission range of 25–35% appears only in vendor blogs (https://deonde.co/blog/?p=11239) and is UNVERIFIED.
- Jahez take rate and delivery fee: REPORTED. https://oyelabs.com/jahez-business-model/. Jahez Prime Kuwait: REPORTED (press release). https://zawya.com/en/press-release/companies-news/jahez-kuwait-introduces-unlimited-free-deliveries-with-jahez-prime-subscription-c6j6v930. Jahez's own investor filings were not checked: UNVERIFIED. Jahez and noon quick-commerce partnership: REPORTED. https://www.mitsloanme.com/article/jahez-and-noon-team-up-to-build-an-integrated-quick-commerce-and-food-delivery-network-in-saudi-arabia
- Mrsool bidding and negotiation model: REPORTED (Bloomberg 2019). https://www.bloomberg.com/news/articles/2019-03-21/delivery-app-outdoes-uber-by-letting-saudis-bargain-on-the-go. Also https://en.wikipedia.org/wiki/Mrsool
- Keeta KSA launch: REPORTED. https://kr-asia.com/meituans-keeta-launches-in-saudi-arabia-igniting-competition-and-price-hikes. Qatar and Kuwait: REPORTED. https://technode.com/2025/08/21/meituans-keeta-launches-in-qatar-eyes-expansion-to-brazil/ and https://technode.com/2025/09/16/meituan-expands-food-delivery-brand-keeta-to-kuwait/. Plans for Oman are mentioned in general GCC coverage only. A launch is UNVERIFIED.
- Ninja, Nana, ToYou, The Chefz: REPORTED. https://sacra.com/c/ninja, https://redseer.com/articles/quick-retail-surges-ninja-leads-in-ksa-talabat-and-noon-share-the-lead-in-uae/, https://bridgemena.com/news/from-market-pioneer-to-financial-restructuring-the-journey-of-nana-app-in-saudi-arabia
- Careem KSA wind-down: REPORTED and not officially confirmed. https://menastartupdigest.com/?p=38070 and https://bridgemena.com/news/careem-scales-back-in-saudi-arabia-a-strategic-reset-in-the-super-app-era
- Aramex Oman send-shipment flow: VERIFIED (company site, via search extract). https://www.aramex.com/om/en/ship/send-shipments

**Saudi courier rules (TGA), as a reference model**
- In 2024 the TGA required non-Saudi delivery-app workers to work through licensed light-transport companies. It phased this in by region, starting with Al-Baha, Jazan, Najran and the Northern Borders, over a 14-month transition, and limited freelance work to Saudis. It also required face verification linked to TGA systems and uniforms. VERIFIED (Saudi Press Agency, via search extract): https://www.spa.gov.sa/en/N2035605. REPORTED: https://gulfnews.com/world/gulf/saudi/self-employment-banned-for-non-saudis-in-delivery-services-1.100627812
- Saudi freelancers need a "Freelance Certificate – Delivery Driver" and can get HRDF support. VERIFIED (HRDF, via search extract): https://www.hrdf.org.sa/en/products-and-services/programs/individuals/enable/financial-aid-for-delivery-app-workers/
- **Lesson for Qabnah:** GCC regulators are moving toward a model where only nationals can freelance, foreigners work through licensed fleet companies, and identity is checked by the platform. Oman is moving the same way (section 3.3).

**Benchmark takeaways**
- Subscriptions (Pro/Plus/Prime) are table stakes at scale. In a small market they are a phase-2 lever, not something to launch with.
- Mrsool's free-text request plus courier offers fits C2C and errand demand where SKUs and addresses are unstructured. Qabnah could offer a "fixed price or courier offers" toggle for C2C. This is a design option, and it needs a legal check on pricing transparency under consumer law.
- Dark stores (Nana, Ninja) are capital-heavy, and Nana's restructuring is a caution. Qabnah's merchant-led and social-seller model is lighter on assets.

---

## 2. Lessons and differentiators for Oman and Muscat

1. **Small market with a dominant incumbent.** Talabat reportedly holds about 75% of Oman's aggregator market. Oman's online food delivery market was reported at about USD 360M in 2024. Both figures are REPORTED: https://www.mordorintelligence.com/industry-reports/oman-foodservice-market. The minister said the market tops RO 100M a year (REPORTED): https://www.thearabianstories.com/2026/01/13/omans-online-food-delivery-market-tops-ro-100-million-a-year-minister-says/. Rather than fight on food, Qabnah should lead with **merchant-initiated delivery for Instagram and WhatsApp sellers, plus C2C**.
2. **Social sellers are a licensed category.** MoCIIP reported 19,366 e-commerce licences, of which 10,454 are active, plus **3,243 licences for marketing and promotion via social media**, as of Aug 2026. REPORTED (Ministry-sourced): https://www.omanobserver.om/article/1194254/business/e-commerce-in-oman-from-an-emerging-sales-channel-to-a-driver-of-the-digital-economy. Merchant onboarding should **capture and validate each seller's CR and e-commerce licence number** (section 3.1).
3. **Addresses.** Oman has no location-based postcode system, and Oman Post postcodes are not part of the National Addressing System at the outset (REPORTED, from an undated addressing-policy site): https://addressoman.avinet.no/standard:national-addressing-system-policy. The **National Addressing Project** is in field implementation in Muscat. Street-naming standards come from **Ministerial Decision 200/2024** (Ministry of Housing and Urban Planning). Building plates carry QR codes linked to geolocation, and nationwide coverage is targeted for 2028. REPORTED: https://www.omanobserver.om/article/1195492/oman/governorates/unified-address-system-enters-implementation-phase-in-muscat. Reported 80% of street naming completed in Muscat (REPORTED): https://timesofoman.com/article/176344-80-per-cent-of-street-naming-address-verification-completed-in-muscat.
   - **Design implication:** make the **map pin plus landmark text plus a voice or photo note** the primary address. Add optional structured fields (wilayat, area, street, building number), and leave a slot for a national-address QR or ID once the system matures.
4. **Cash on delivery** is still widely used, but the evidence is thin and conflicting. A 2018 US government page lists lack of COD as a top barrier (REPORTED): https://legacy.export.gov/article?id=Oman-eCommerce. A market report puts COD at 18% of cross-border payments (REPORTED, weak): https://www.marketresearch.com/Ken-Research-v3771/Oman-Cross-Border-Import-Commerce-44099382. Build COD with **courier cash ledgers, daily remittance and merchant settlement netting** from day one.
5. **Debit-card rails.** OmanNet debit cards are reported to be about 95% of cards in Oman (REPORTED): https://www.omanobserver.om/ampArticle/1137628. Any gateway must support OmanNet, not just Visa and Mastercard.
6. **Currency.** OMR has 3 decimals, 1 OMR = 1000 baisa. Store all money as **integer baisa**. Thawani's API takes amounts in baisa (section 4). Show prices as `OMR 2.500` / `٢٫٥٠٠ ر.ع.`. The Consumer Protection Law requires an Arabic invoice (section 3.5).
7. **Arabic first.** Build RTL Arabic as the default with English as the secondary language. Consumer law requires invoices in Arabic and warnings in Arabic and English (REPORTED): https://aromanlaw.com/en/post/oman-consumer-protection-law-rd-66-2014-rights-penalties
8. **Regulatory moat.** Delivery in Oman is now heavily licensed (sections 3.2–3.3). Compliant onboarding of fleet partners and couriers (licences, Naql vehicle registration, Omanisation ratios) can be a differentiator for merchants who need assurance.

---

## 3. Oman legal and regulatory requirements to validate

### 3.1 Company registration, foreign ownership, e-commerce licence
- **Foreign Capital Investment Law, Royal Decree 50/2019.** Allows 100% foreign ownership for most activities, subject to a negative list. REPORTED: https://www.mondaq.com/Article/894308/The-New-Foreign-Capital-Investment-Law-In-Oman
- **Negative list:** Ministerial Decision 209/2020, as amended by **Ministerial Decision 435/2024** (29 Aug 2024), which added 28 activities for a total of about 123 reserved for Omanis. REPORTED: https://www.dentons.com/en/insights/alerts/2024/september/25/oman-increases-the-number-of-commercial-activities-prohibited-to-foreign-investors. Whether any courier, delivery or motorcycle-transport activity is on the list is **UNVERIFIED / NEEDS LEGAL CONFIRMATION**.
- **E-commerce licence:** **Ministerial Decision 499/2023** (MoCIIP), effective 90 days after gazette publication in Sept 2023. Individuals and establishments must get an e-commerce licence, which requires a commercial registration. Applications go through the Oman Business Platform / Invest Easy (sources differ on the portal name). REPORTED: https://www.muscatdaily.com/2023/09/10/mociip-issues-regulation-for-e-commerce/ and https://www.omanobserver.om/article/1142645/oman/e-commerce-regulation-issued
- The Ministry urged e-commerce businesses to **contract only licensed postal or courier providers**, with the list published by the TRA. REPORTED: https://www.omanobserver.om/article/1150340/oman/only-licensed-firms-responsible-for-delivery-of-e-commerce-products
- **To validate:** the exact ISIC activity codes for (a) the platform or marketplace, (b) courier or last-mile delivery, (c) payment collection agent. Also whether merchants on the platform each need their own e-commerce licence, and whether Qabnah must check it.

### 3.2 Postal, courier and delivery-platform licensing (product-critical)
- **Postal Services Regulatory Law, Royal Decree 71/2012**, with its Executive Regulation 89/2013. Article 15: no paid postal or related service may be provided without a licence. VERIFIED (decree.om and TRA, via search extract): https://decree.om/2012/rd20120071/ and https://tra.gov.om/pdf/psegulatorylawen.pdf, https://tra.gov.om/pdf/postal-services-executive-regulation-Law-en.pdf
- **TRA Decision 1152/2/19/2024-21** set postal licence classes (local international mail and local mail). It also reportedly set a minimum investment of **RO 250,000 within 3 years**. REPORTED: https://www.omanobserver.om/article/1160941/oman/community/tra-issues-regulations-for-postal-service-licenses. The licensed-company list is published by the TRA: https://tra.gov.om/pdf/list_of_licensed_postal_companies_eng.pdf
- **Royal Decree 57/2026 on the Postal Sector** (issued 18 May 2026). It transfers postal-sector regulation from the TRA to the **Ministry of Transport, Communications and IT (MTCIT)**, and **assigns MTCIT the mandate to regulate and license express and last-mile delivery via digital media ("delivery applications")**. VERIFIED (decree.om, via search extract): https://decree.om/2026/rd20260057/. REPORTED: https://www.thearabianstories.com/2026/05/18/omans-postal-sector-transferred-to-transport-ministry-under-royal-decree/
- Reports from late 2025 say delivery service providers must operate through **licensed entities** and **register vehicles and drivers on the national "Naql" platform**. REPORTED: https://timesofoman.com/article/164847-oman-restructures-delivery-sector-to-boost-jobs-for-citizens
- **MTCIT "Wasl/Wassel" programme** (Sept 2026). E-service on Naql to register commercial delivery motorcycles, link them to licensed drivers and issue vehicle operating cards. Also a plan to move delivery to electric motorcycles. VERIFIED (MTCIT, via search extract): https://mtcit.gov.om/media-4/news-announcements-11/news-85/wasl-highlights-efforts-to-develop-and-regulate-express-delivery-services-and-announces-plan-to-transition-to-electric-motorcycles-1466. REPORTED: https://aiinoman.com/blog/wassel-omans-new-digital-platform-for-delivery-bikes
- The minister said about 2,000 motorcycle permits were issued, with **20 Omanis to be employed per 200 licensed motorcycles**. **Delivery companies, not platforms, now manage delivery operations.** REPORTED: https://www.thearabianstories.com/2026/01/13/omans-online-food-delivery-market-tops-ro-100-million-a-year-minister-says/
- **NEEDS LEGAL CONFIRMATION (blocking for architecture):**
  1. Does Qabnah, as a "delivery application", need its own MTCIT licence? Does C2C parcel delivery need a postal/courier licence (with the RO 250k investment)?
  2. Can Qabnah contract **individual** couriers directly, or only **licensed delivery companies (fleet operators)** that employ the riders?
  3. Has MTCIT issued implementing regulations under RD 57/2026? None were found.

### 3.3 Couriers: labour, Omanisation, vehicles, traffic (product-critical)
- **Professional licence for delivery workers and supervisors**, required from **1 Sept 2025** and issued by the Ministry of Labour's Sector Skills Unit for logistics. No work permit is issued or renewed without it. Applies to all companies. Fees start at about OMR 20, with lower rates for Omanis. Reported penalties are OMR 1,000–2,000, possible jail, deportation and company suspension. REPORTED: https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2025/mandatory-licenses-for-food-delivery-workers and https://gulfnews.com/world/gulf/oman/oman-enforces-mandatory-licences-for-food-delivery-agents-from-september-1-1.500245872
- **Professional delivery exam** run by the Oman Logistics Association, and a **"preventive driving licence"** for drivers. Platform–driver contracts are being regulated. **Full Omanisation of delivery riders has been reached in Nizwa, Ibri and Sohar**, with Muscat "expected" to follow. REPORTED: https://timesofoman.com/article/164847-oman-restructures-delivery-sector-to-boost-jobs-for-citizens
- **Expatriates in food delivery must use motorcycles. Omanis may use cars.** The food-delivery **supervisor** role is Omanised (a 20% Omanisation requirement for last-mile supervisory roles is also reported). REPORTED: https://www.omanobserver.om/article/1199534/oman/delivery-boom-raises-safety-concerns and https://www.muscatdaily.com/2025/04/14/oman-targets-5380-jobs-for-citizens-in-key-sectors-in-2025/
- **Driving occupations reserved for Omanis:** Ministry of Labour decision 9/2021 covers vehicles carrying fuel, agricultural materials and foodstuffs. Decision **501/2024** expands this to refrigerated trucks for food and medical products, among others. REPORTED: https://timesofoman.com/article/105858-only-omani-drivers-can-transport-these-goods and https://travelobiz.com/oman-expands-restricted-professions-for-non-omani-workers-new-rules-explained/. How far "foodstuff transport" reaches into app-based food or grocery delivery is **UNVERIFIED / NEEDS LEGAL CONFIRMATION**.
- **Freelance status:** there is no freelance visa for foreigners. Foreign workers need an employer-sponsored work permit. REPORTED (weak): https://www.stampednomad.com/visas/oman-freelancer-visa. **Design implication:** an "independent captain" model is realistic only for **Omani nationals**, possibly with a self-employment or "Riyada" registration that needs confirming. Foreign riders must come through **licensed fleet companies**. NEEDS LEGAL CONFIRMATION.
- **Main-road ban:** food-delivery motorcycles may not use main roads, under **Article 39 of the Executive Regulation of the Traffic Law** (ROP). Announced around May 2026. REPORTED: https://timesofoman.com/article/172247-food-delivery-two-wheelers-prohibited-from-using-main-roads-in-oman and https://gulfnews.com/world/gulf/oman/oman-bans-delivery-motorcycles-on-key-roads-to-improve-traffic-safety-1.500553108. **Routing and ETA must account for secondary-road-only motorcycle routing.**
- **Summer midday outdoor-work ban,** 12:30–15:30 from June to August (Ministry of Labour). The governing decision number varies by source (286/2008 or 322/2011). Whether delivery riders are covered is UNVERIFIED. REPORTED: https://gulfnews.com/world/gulf/oman/oman-announces-summer-midday-breaks-for-worker-safety-1.500131575

**Product design impact (summary):** Courier onboarding must collect and check: nationality, MoL delivery professional licence number, driving licence class, vehicle type versus nationality rule, Naql vehicle registration or operating card, and fleet-company affiliation for expatriates. Dispatch needs a vehicle type flag (motorcycle or car) and road-class restrictions.

### 3.4 Personal Data Protection Law (PDPL)
- **Royal Decree 6/2022** with its **Executive Regulation (Ministerial Decision 34/2024)**. The regulator is MTCIT. VERIFIED (MTCIT, via search extract): https://mtcit.gov.om/sectors/governance/personal. Regulation number and details are REPORTED: https://www.addleshawgoddard.com/en/insights/insights-briefings/2024/data-protection/executive-regulations-oman-personal-data-protection-law/
- **Full enforcement from 5 Feb 2026** after the grace period. REPORTED: https://cms.law/en/omn/legal-updates/oman-personal-data-protection-law-entering-the-enforcement-phase
- **Consent and processing:** explicit consent is the main basis. Processing **sensitive data** (genetic, biometric, health, racial origin, political or religious views, criminal records) needs an **MTCIT permit**: valid 5 years, decided within 45 days, changes notified within 15 days. REPORTED: https://www.trowers.com/insights/2024/february/omans-data-protection-law---new-regulations
  - **Relevance:** courier selfie or face-match KYC may count as **biometric** processing and so need a permit. Criminal-record checks for couriers also fall under sensitive data. NEEDS LEGAL CONFIRMATION.
  - **Location tracking:** neither the PDPL nor the Regulation lists it as sensitive, as far as found (UNVERIFIED). Treat it as personal data that needs specific, purpose-bound consent. Track couriers only while on shift. Keep a retention policy for location history.
- **DPO:** sources read the requirement as broadly mandatory. MTCIT reportedly prefers the DPO to be in Oman. REPORTED: https://www.clydeco.com/en/insights/2024/02/oman-issues-executive-regulations-to-pdpl
- **Breach notification:** notify MTCIT within **72 hours** (Exec. Reg. Art. 30). Notify data subjects where there is high risk. REPORTED: https://www.pwc.com/m1/en/blogs/pdf/Oman-PDPL-series-Part2-Executive-Regulations.pdf
- **Cross-border transfer:** Exec. Reg. Art. 37 is reported to require consent (unless the data is anonymised) and adequate protection. Sources conflict on whether MTCIT approval is needed. MTCIT's page reportedly requires approval where **sensitive** data is processed outside Oman. NEEDS LEGAL CONFIRMATION, and it decides **hosting region** (section 3.8).
- **ID document storage** (civil ID or resident card scans for couriers and C2C senders): this is personal data, not listed as sensitive. Apply minimisation, encryption and a retention schedule. UNVERIFIED as to any specific rule.

### 3.5 Electronic transactions, consumer protection, e-commerce disclosures
- **Electronic Transactions Law: Royal Decree 69/2008 has been REPEALED** and replaced by **Royal Decree 39/2025** (issued 9 Apr 2025, in force the day after publication). It covers e-transactions, documents, signatures and trust services. VERIFIED (decree.om, via search extract): https://decree.om/2025/rd20250039/. REPORTED: https://tamimi.com/news/oman-enacts-new-electronic-transactions-law-royal-decree-no-39-2025. Any consumer-specific provisions are UNVERIFIED.
- **Consumer Protection Law, Royal Decree 66/2014**, with its Executive Regulation (reported as Decision 77/2017). The authority is the Consumer Protection Authority. VERIFIED that it exists (ECOLEX): https://www.ecolex.org/details/legislation/royal-decree-no-662014-to-promulgate-the-consumer-protection-law-lex-faoc150084/. Reported duties:
  - Arabic invoice, and warnings in Arabic and English.
  - No charging above the advertised price (Art. 28).
  - **Promotions and discounts need prior approval** (Art. 31). This affects **promo codes and coupons**.
  - Product warranty (Art. 17).
  - A 15-day return period is reported by one source only: UNVERIFIED.
  - REPORTED: https://aromanlaw.com/en/post/oman-consumer-protection-law-rd-66-2014-rights-penalties
- **E-commerce rules (Oct 2024):** online sellers must get approval, display products accurately, state the place, date and method of delivery, and publish a clear exchange and return policy. REPORTED: https://www.lexis.ae/2024/10/31/oman-new-ecommerce-regulations-to-protect-consumer-rights/
- **Storefront requirements to validate:** seller identity and CR/licence number on the storefront, total price in OMR including VAT and delivery before payment, delivery-time disclosure, return/exchange policy per merchant, Arabic invoice, and approval workflow for promotions.

### 3.6 VAT and e-invoicing
- **VAT Law, Royal Decree 121/2020.** Rate is 5%, effective 16 Apr 2021. Mandatory registration threshold is **OMR 38,500**, voluntary is **OMR 19,250** (Ministerial Decision 1/2021). REPORTED: https://www.pwc.com/m1/en/tax/documents/2020/oman-vat-law-published-in-official-gazette-updated.pdf and https://taxsummaries.pwc.com/oman/corporate/other-taxes. Record retention is reportedly 10 years.
- **E-invoicing ("Fawtara"):** Peppol-based five-corner model. The OTA became a Peppol Authority on 7 Jan 2026. **Phase 1 is a pilot from Aug 2026 with about 100 large taxpayers.** Phase 2 dates conflict: Feb 2027 versus 1 Apr 2027 (>OMR 5M supplies, Decision 189/2026). Later phases are not yet set in legislation. REPORTED: https://www.fonoa.com/resources/blog/oman-e-invoicing and https://lookuptax.com/tax-changes/oman/einvoicing-fawtara-phases. Check the OTA rollout checker on taxoman.gov.om: UNVERIFIED (not accessed).
- **To validate:** VAT treatment of the platform's commission versus delivery fees versus goods sold by merchants (agent or principal). Who issues the tax invoice to the consumer. Whether the platform has deemed-supplier obligations (none found).

### 3.7 Payments regulation (Central Bank of Oman)
- **National Payment Systems Law, Royal Decree 8/2018** (76 articles, 11 chapters). It licenses banks and non-bank PSPs. The Executive Regulation is reported as CBO Board Decision 1/2019. VERIFIED (CBO, via search extract): https://cbo.gov.om/sites/assets/Documents/English/PaymentSystems/TheLegalFrameworkoftheNationalPaymentSystemsEn.pdf. Licence request: https://gov.om/en/w/request-a-license-for-institutions-under-the-supervision-of-the-central-bank-of-oman
- **New Banking Law, Royal Decree 2/2025**, works alongside the NPS Law. REPORTED: https://cbo.gov.om/sites/assets/Documents/CC/Open%20Banking%20Regulatory%20Framework_Oman.pdf
- **PSP licensing policy:** reported categories 1–3 with capital of OMR 100k / 200k / 500k. **Payment aggregation and gateway** services may reportedly be provided **without a licence, on registration with the CBO through a licensed bank or PSP**. Holding funds or a customer ledger is assessed separately and may trigger licensing. Consumer funds must be in escrow or segregated. REPORTED: https://prifinance.com/en/payments/oman-payment-license/ and https://finpeel.com/answers/payments-licence-oman
- **Product design impact:** a marketplace that collects card payments for merchants and pays them out later may be doing regulated **payment aggregation or fund holding**. Safer defaults:
  1. Use a licensed PSP's **split or sub-merchant settlement** so funds go to the merchant directly.
  2. Or have the PSP or bank hold funds in escrow.
  3. **Do not build a stored-value wallet** (courier earnings wallet, customer balance) without CBO advice.
  4. COD cash that couriers collect for merchants needs a contractual collection-agent structure.
  - NEEDS LEGAL CONFIRMATION.

### 3.8 Cybersecurity and data localisation
- **TRA Decision 1152/2/19/2024-20** regulates cloud and data-centre services. Providers need a TRA permit. Art. 12 bars CSPs from moving **Level 3/4 (sensitive, government, financial)** data abroad without TRA approval. REPORTED: https://www.mondaq.com/data-protection/1540350/
- **Cloud First Policy (MTCIT)** applies to government entities. It was updated by circular on 28 Jun 2026. VERIFIED (MTCIT, via search extract): https://mtcit.gov.om/library-3/legislations-policies-8/policies-73/cloud-first-policy-1416
- No general localisation mandate for private-sector personal data was found. A 2025 Digital Cooperation Organization report says Oman generally does not require localisation (REPORTED): https://dco.org/wp-content/uploads/2025/10/Oman-Report.pdf. **Payment and financial data** may fall under CBO rules (UNVERIFIED). **Hosting choice (in-country versus GCC region versus EU) needs counsel sign-off.**

---

## 4. Payments in Oman

| Method / provider | Status | Source |
|---|---|---|
| **Thawani Pay** (Omani gateway, hosted checkout) | VERIFIED that it exists, and partly for the API (below) | https://thawani.om/?p=9403 |
| **OmanNet** debit (national switch, about 95% of cards) | REPORTED share. OMR-only, enabled per merchant on Tap | https://developers.tap.company/docs/omannet, https://www.omanobserver.om/ampArticle/1137628 |
| **Tap Payments** | VERIFIED (Tap docs): supports OmanNet. Tap support says Oman and regional businesses can enable it | https://support.tap.company/en/support/solutions/articles/153000140241 |
| **Amwal Pay** | REPORTED: CBO-licensed PSP. Visa, Mastercard, Apple Pay, Samsung Pay. OmanNet not confirmed | https://bridgemena.com/news/fintech/amwal-pay-expands-its-services-to-strengthen-omans-payment-infrastructure |
| **Amazon Payment Services** | REPORTED: launched in Oman with OmanNet | https://www.omanobserver.om/ampArticle/1137611 |
| **Paymob** | REPORTED: holds a CBO PSP licence | https://www.zawya.com/en/press-release/companies-news/paymob-secures-central-bank-of-omans-psp-license-we9hximo |
| **Bank gateways** (Bank Muscat, NBO, Bank Dhofar) | UNVERIFIED: no gateway or API docs found this session | n/a |
| **Apple Pay** | REPORTED: launched in Oman (Bank Muscat, NBO, Bank Dhofar, Sohar International and others). Bank Dhofar and Bank Nizwa announced it themselves | https://zawya.com/en/business/banking-and-insurance/apple-pay-launched-in-oman-cosgz8f3 |
| **Samsung Pay** | REPORTED: launched 2024 via NBO, Sohar International, Bank Dhofar, Ahli Bank | same as above |
| **COD** | REPORTED as common (section 2) | n/a |

### 4.1 Thawani Checkout API (for an adapter)

**What was checked:** the official docs are at `developer.thawani.om` / `docs.thawani.om` / `thawani-technologies.stoplight.io`, and they could not be opened (network block). The search-engine extracts of the official "Create Session" and "Retrieve Session" pages confirm the base URLs, the header and the pay-page URL format. Two independent npm client libraries were downloaded and read: `thawani-nodejs@1.0.2` (2025) and `thawani-node@1.2.0` (2021). Both agree on the base URLs.

| Item | Value | Status |
|---|---|---|
| UAT base URL | `https://uatcheckout.thawani.om/api/v1` | VERIFIED (official docs extract plus 2 libraries) |
| Production base URL | `https://checkout.thawani.om/api/v1` | VERIFIED (same) |
| Auth header | `thawani-api-key: <secret_key>` and `Content-Type: application/json` | VERIFIED (official docs extract plus library code) |
| Keys | Secret key (server-side API calls) and publishable key (pay-page redirect), both from the merchant portal. The docs publish shared UAT test keys, which are deliberately not copied here | VERIFIED (docs extract) |
| Create session | `POST /checkout/session` | VERIFIED |
| Request body | `client_reference_id` (string), `mode` (`"payment"`; `"subscription"` also typed), `products[]` {`name`, `quantity`, `unit_amount`}, `success_url`, `cancel_url`, `metadata` (object). Optional in the library types: `customer_id`, `save_card_on_success`, `expire_in_minutes`, `plan_id` | REPORTED (library types and community examples). Which fields are required, and field-length limits, are UNVERIFIED |
| Amount unit | **baisa (integer)**, e.g. `2000` = OMR 2.000. One Python example passes a string, so send integers and test in UAT | REPORTED (docs extract and community) |
| Response | Wrapped in `{ data: {...} }`. Includes `session_id`, `client_reference_id`, `products`, `total_amount`, `currency`, `payment_status`, `invoice`, `metadata`, `created_at`, `expire_at`. Errors return a `description` field | REPORTED (library code) |
| Redirect customer | `https://[uat]checkout.thawani.om/pay/{session_id}?key={publishable_key}` | VERIFIED (official docs extract plus library constant) |
| Retrieve session | `GET /checkout/session/{session_id}` → `payment_status` ∈ `unpaid` / `paid` / `cancelled` | Endpoint VERIFIED (official "Retrieve Session" page exists). Status values REPORTED |
| Other session endpoints | `GET /checkout/session/reference/{client_reference_id}`, `GET /checkout/session/invoice/{invoice}`, `GET /checkout/session?limit=&skip=`, `POST /checkout/session/{id}/cancel` | REPORTED (library only) |
| Other resources | `/customers`, `/payment_methods`, `/payment_intents`, `/refunds`, `/payments` | REPORTED (library only) |
| **Webhooks** | Library expects headers `thawani-signature` and `thawani-timestamp`. Signature = hex HMAC-SHA256 of `body + "-" + timestamp` with the webhook secret. Events typed as `payment.succeeded`, `payment.failed`, `refund.succeeded`, `refund.failed` | **UNVERIFIED**: from one third-party library only. No official confirmation found |

**Adapter recommendations:**
- **Never trust the `success_url` redirect alone.** On return, and from webhooks, always confirm with `GET /checkout/session/{id}` and require `payment_status == "paid"`.
- Use the order ID as `client_reference_id` so lookups are idempotent.
- Put `order_id` and `merchant_id` in `metadata`.
- Run a reconciliation job that polls unpaid sessions until `expire_at`.
- Treat webhook signature verification as feature-flagged until it is confirmed against the official docs or Thawani support.

---

## 5. Messaging

### WhatsApp Business Platform (Cloud API)
- **Pricing is per message from 1 July 2025.** Marketing, utility and authentication templates are charged on delivery. **Utility templates sent inside an open customer-service window are free** (reported). Meta said it would announce to-be rates by 1 Sept 2026. VERIFIED (Meta docs, via search extract): https://developers.facebook.com/docs/whatsapp/pricing. Free-within-window detail is REPORTED: https://gallabox.com/whatsapp-business-pricing-July-2025-update
- **Customer-service window:** 24 hours from the user's last message, during which free-form messages can be sent. Outside it, only approved **templates** can be sent. REPORTED (vendor docs). Re-confirm on Meta's docs.
- **Webhook security:** POSTs are signed with `X-Hub-Signature-256: sha256=<hex HMAC-SHA256(raw_body, APP_SECRET)>`. Verify against the **raw** body with a constant-time compare. The GET verification uses `hub.mode`, `hub.verify_token` and `hub.challenge`. REPORTED: https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices
- **Graph API version:** **v26.0 was released 29 Jul 2026**. VERIFIED (Meta blog, via search extract): https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/. v25.0 was released 18 Feb 2026. A **v27.0 is reported** by one outlet without a confirmed date (UNVERIFIED): https://ppc.land/metas-api-v27-may-add-catalog-products-to-new-ads-by-default/. Keep the version in config (e.g. `WHATSAPP_GRAPH_VERSION=v26.0`) and check the WhatsApp changelog before go-live.
- **Templates to pre-approve (Arabic and English):** order confirmation, courier assigned, out for delivery with tracking link, delivered, COD amount due, OTP (authentication category), payment-link (utility).

### SMS sender ID (Oman)
- Alphanumeric sender IDs (3–11 characters) must be **pre-registered** with operators (Omantel, Ooredoo, Vodafone Oman). Registration takes a company NOC letter and sample content, and reportedly 1–3 weeks. REPORTED: https://docs.linkmobility.com/regulatory-guidelines/sender-id/oman and https://support.telnyx.com/en/articles/6679138-oman-sms-guidelines. Ooredoo bulk-SMS form: https://www.ooredoo.om/wp-content/uploads/2023/07/bulkSMSenglish.pdf
- The TRA has reportedly set **time limits and safeguards for marketing calls and SMS** (REPORTED, headline only): https://www.muscatdaily.com/?p=108628. The detailed TRA instrument was not found (UNVERIFIED).

---

## 6. Muscat logistics and operations

- **Geography:** Muscat Governorate is a narrow strip about 50–60 km long between the Hajar mountains and the coast. It runs from Seeb and Al Khoud in the west, past the airport, Bawshar, Al Khuwair and Qurum, to Ruwi and Muttrah, with Al Amerat inland to the south-east beyond the hills. The main arteries are Sultan Qaboos Street and the Muscat Expressway. Since delivery motorcycles are banned from main roads (section 3.3), **motorcycle trips across the city are slow. Zone-based dispatch matters more than in Saudi cities.** (Geography is general knowledge: UNVERIFIED.)
- **Heat:** the midday outdoor-work ban runs 12:30–15:30 from June to August (section 3.3). Plan rider shifts, insulated bags and courier rest points around it.
- **Weekend and hours:** the weekend is Friday–Saturday (UNVERIFIED this session: background knowledge only). Expect Friday-prayer dips around midday and demand peaks in the evening and late night.
- **Ramadan:** private-sector Muslim staff work a maximum of 6 hours a day and 30 hours a week (2026 notice). Demand moves to around iftar and late night. REPORTED: https://gulfnews.com/world/gulf/oman/ramadan-2026-oman-announces-reduced-working-hours-for-public-and-private-sectors-1.500438641
- **Recommended launch zones:** a central dense corridor (Al Khuwair, MSQ/Al Ghubrah, Qurum, Ruwi) for merchants and offices, plus Bawshar, Al Mawaleh/Al Hail and Seeb/Al Khoud for residential C2C. Add Muttrah and Al Amerat in phase 2 (Muttrah has narrow old-town streets, Amerat is across the hills).

**Approximate zone centres for seed data.** These are **approximate (±1–2 km), from general geographic knowledge, and not verified**. Check them on a map before use.

| Zone (EN / AR) | Approx. lat | Approx. lng |
|---|---|---|
| Al Khuwair / الخوير | 23.592 | 58.425 |
| Madinat Sultan Qaboos / مدينة السلطان قابوس | 23.603 | 58.402 |
| Qurum / القرم | 23.610 | 58.480 |
| Ruwi / روي | 23.590 | 58.545 |
| Muttrah / مطرح | 23.618 | 58.566 |
| Bawshar / بوشر | 23.575 | 58.400 |
| Al Ghubrah / الغبرة | 23.598 | 58.385 |
| Al Mawaleh / الموالح | 23.575 | 58.240 |
| Seeb / السيب | 23.670 | 58.185 |
| Al Khoud / الخوض | 23.595 | 58.160 |
| Al Amerat / العامرات | 23.525 | 58.495 |

---

## 7. Checklist for DECISIONS.md

| # | Requirement | Owner | Status |
|---|---|---|---|
| 1 | Confirm the CR activity codes (ISIC) for marketplace, courier/last-mile and collection agent. Check the foreign-ownership negative list (MD 209/2020 as amended by 435/2024) | Legal | To validate |
| 2 | Get an e-commerce licence under MD 499/2023. Decide whether merchants must each hold one and whether Qabnah must check it | Legal / Eng | To validate |
| 3 | Find out whether Qabnah needs an MTCIT "delivery application" licence under RD 57/2026, and the status of implementing rules | Legal | To validate |
| 4 | Find out whether C2C parcel delivery needs a postal/courier licence (RD 71/2012, TRA Decision 1152/2/19/2024-21, RO 250k investment) or must go through a licensed courier | Legal | To validate |
| 5 | Courier model: can independent Omani couriers contract directly? Must expatriate riders come only through licensed fleet companies? What Omanisation ratio applies (e.g. 20 per 200 motorcycles, supervisor Omanisation)? | Legal / Ops | To validate |
| 6 | Courier onboarding fields: MoL delivery professional licence, driving licence, preventive driving licence, Naql vehicle registration or operating card, nationality and vehicle-type rule | Eng / Ops | To validate |
| 7 | Dispatch and routing: motorcycle main-road ban (Traffic Law Exec. Reg. Art. 39). Midday summer work ban | Eng / Ops | To validate |
| 8 | PDPL: appoint a DPO (Oman-based?), records of processing, consent flows for location, privacy notice in Arabic and English | Legal / Eng | To validate |
| 9 | PDPL: decide whether courier face-match or KYC counts as biometric (sensitive) processing that needs an MTCIT permit. Same for criminal-record checks | Legal | To validate |
| 10 | PDPL: breach response runbook with 72-hour MTCIT notice | Eng / Legal | To validate |
| 11 | Hosting region and cross-border transfer (Exec. Reg. Art. 37, TRA cloud decision, CBO expectations for payment data) | Legal / Eng | To validate |
| 12 | Retention schedule for location history, ID scans and chat logs | Legal / Eng | To validate |
| 13 | Consumer law: Arabic invoice, final OMR price including VAT and delivery fee shown before payment, delivery time disclosure, return and exchange policy per merchant | Legal / Eng | To validate |
| 14 | Consumer law: approval process for promotions and discounts (Art. 31) before launching promo codes | Legal / Ops | To validate |
| 15 | Review the e-contract terms against the new Electronic Transactions Law (RD 39/2025), not the repealed RD 69/2008 | Legal | To validate |
| 16 | VAT: registration, agent or principal treatment of goods versus commission versus delivery fee, invoice issuer | Legal / Finance | To validate |
| 17 | Fawtara e-invoicing phase applicable to Qabnah and to merchants. Keep invoice data model Peppol-ready | Finance / Eng | To validate |
| 18 | Payments: confirm whether marketplace collection, delayed settlement and payout is regulated aggregation or fund holding under RD 8/2018. Prefer PSP split settlement. No stored-value wallet without CBO advice | Legal / Eng | To validate |
| 19 | COD: collection-agent contracts with merchants, courier cash ledger, daily remittance controls | Legal / Ops / Eng | To validate |
| 20 | Thawani: confirm required fields, webhook signature scheme and events, refund API with Thawani (official docs or support). Test in UAT with integer baisa | Eng | To validate |
| 21 | OmanNet support. Choose a primary and a backup gateway (Thawani, Tap, Amwal, APS) | Eng / Finance | To validate |
| 22 | Apple Pay availability through the chosen gateway | Eng | To validate |
| 23 | WhatsApp: Business verification, Arabic and English templates, pin the Graph API version (v26.0 or later), X-Hub-Signature-256 verification | Eng | To validate |
| 24 | SMS: register the alphanumeric sender ID with each Omani operator. Check TRA marketing-message time limits | Ops / Eng | To validate |
| 25 | Addresses: pin plus landmark as the primary address. Optional national-address fields and QR scan (MD 200/2024 programme) | Eng | To validate |
| 26 | Service zones: verify the zone centres and polygons on a map. Phase-1 zones as in section 6 | Ops / Eng | To validate |
| 27 | Cloud or data-centre vendor holds a TRA permit if hosting in Oman (TRA Decision 1152/2/19/2024-20) | Eng / Legal | To validate |
| 28 | Insurance for couriers and goods in transit, and any MTCIT or ROP rules on commercial motorcycle insurance | Legal / Ops | To validate |
