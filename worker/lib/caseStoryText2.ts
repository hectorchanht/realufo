// Fact-checked case stories, batch 2 (spec 2026-10-03-realufo-case-stories-batch2-design).
// Worker-only — never import into the SPA. Merged into CASE_STORY_TEXT by caseStoryText.ts.
// Researched against primary documents 2026-10-03; reviewed by the owner before deploy.
import type { CaseStory } from "./caseStories";

export const CASE_STORY_TEXT_2: Record<string, CaseStory> = {
  "chiles-whitted": {
      title: "Chiles–Whitted 1948: two airline pilots, a flaming 'rocket ship' and a probable meteor",
      sections: [
        {
          heading: "Trip 576",
          paras: [
            "Eastern Air Lines Trip 576 left Houston, Texas, at 8:40 p.m. Eastern Standard Time on a Friday night in July 1948, bound for Atlanta. The co-pilot, John B. Whitted, wrote that at 0245 EST the crew, flying at 5,000 feet about 25 miles southwest of Montgomery, Alabama, saw a strange object coming toward them at a high rate of speed, with a stream of red fire coming from its tail [2].",
            "Captain Clarence S. Chiles set down his own account for Eastern Air Lines in Atlanta on 3 August 1948. He placed the encounter twenty miles southwest of Montgomery on 24 July. At 2:45 a.m., he wrote, what looked like a jet aircraft came toward them to their right and slightly above, on a clear moonlit night with excellent visibility. They watched it for around ten seconds. It had no wings, shot flame some fifty feet from the rear and had two rows of windows, which he took to mean an upper and a lower deck, with a very bright light glowing inside. Underneath it there was a blue glow. It pulled up into light broken clouds and was lost from view [1].",
            "Whitted wrote that he could see no wings, that the object was cigar shaped and about a hundred feet long, and that its fuselage looked about three times the circumference of a B-29's. Its windows were very large and seemed square. He estimated that they watched it for at least 5 seconds and not more than 10, at a distance of about half a mile [2]."
          ],
          quote: {
            text: "It was clear there were no wings present",
            who: "Capt. Clarence S. Chiles, statement written in Atlanta, 3 August 1948",
            src: 1
          }
        },
        {
          heading: "What the crew did next",
          paras: [
            "Whitted wrote that Chiles had the company radio operator at Columbus, Georgia, ask Lawson Field at Fort Benning whether the Army had any jet or experimental planes nearby. The answer came back that Lawson Field had no planes flying in the area, and Chiles radioed that a strange aircraft had just passed them that looked like some type of rocket ship. Ground fog made them skip Columbus, and they flew on to Atlanta [2]. Chiles added that the only passenger awake at the time saw only the trail of fire as the object passed and pulled into the clouds [1].",
            "An unsigned Air Force summary in the case file, headed \"TRUE 'UNKNOWN'\", records Chiles turning to his co-pilot and saying, \"Look, here comes a new Army jet job.\" It gives the object as a wingless aircraft 100 feet long, cigar-shaped and about twice the diameter of a B-29, passing on the right at about half a mile before pulling up sharply into a cloud [3]. The pilots' own figures for distance, size and duration therefore differ from each other and from the summary.",
            "Both pilots wrote that they felt nothing as the object went by: Chiles reported no prop wash or rough air, and Whitted no noise or turbulence [1][2]. Ruppelt's 1956 book, a main source for later retellings, says the DC-3 hit turbulent air just as the object flashed past; the crew's written statements contradict this [10]."
          ],
          quote: {
            text: "We heard no noise nor did we feel any turbulence from the object.",
            who: "First Officer John B. Whitted, statement in the Blue Book file",
            src: 2
          }
        },
        {
          heading: "The witness at Robins Air Force Base",
          paras: [
            "On 10 August 1948 Lt. Col. Cropper of the 6th District Office of Special Investigations interrogated a Robins Air Force Base employee near Macon, Georgia, whose name is blacked out in the released file. He was 23, a member of the Transient Maintenance Alert Crew on the midnight shift, and said the object appeared between 0140 and 0150 Eastern Standard Time while he stood fire guard on a C-47. It came out of the north, stayed in view for about twenty seconds and was last seen taking a southwest course [4].",
            "J. Allen Hynek, the astronomer who reviewed the case as Incident #144, also linked it to two sightings near Blackstone, Virginia, that same night [5]. He noted that the Robins and Montgomery reports were exactly one hour apart if both times really were in Eastern Standard Time [6]."
          ],
          quote: {
            text: "appeared to be a cylindrical shaped object with a long stream of fire coming out of the tail end.",
            who: "Robins AFB employee, OSI interrogation, 10 August 1948",
            src: 4
          }
        },
        {
          heading: "Hynek's meteor hypothesis",
          paras: [
            "Hynek wrote that the two reliable pilots obviously saw something. Taking only some parts of their description (tremendous bursts of flame, cigar shape, orange-red flame, five to ten seconds in sight, a disappearance into a cloud), he judged that this much at least could be satisfied by a brilliant, slow-moving meteor. He found the orange-red flame particularly suggestive, and noted that the one passenger awake gave a description that agreed with a meteor rather than a space ship. Whether a bright meteor's trail could produce the impression of lit windows, he wrote, would have to be left to the psychologists [5].",
            "His conclusion turned on the clock. If the one-hour gap was real, the object was some form of aircraft; if it was not, and the airline had been keeping daylight saving time, it must have been an extraordinary meteor. Two separate objects on the same course, exactly one hour apart, he considered too improbable [6]. A typed evaluation sheet in the Blue Book file records the sighting as \"Probable Astro (METEOR)\" [7]."
          ],
          quote: {
            text: "For #144, there is no astronomical explanation if we accept the report at face value.",
            who: "J. Allen Hynek, analysis of Incident #144",
            src: 5
          }
        },
        {
          heading: "The Estimate of the Situation",
          paras: [
            "Edward Ruppelt, who later headed Project Blue Book, wrote that a few days after the DC-3 encounter people at the Air Technical Intelligence Center decided to write an \"Estimate of the Situation\", and that its estimate was that the objects were interplanetary. He says it reached Air Force Chief of Staff General Hoyt S. Vandenberg, who rejected it because the report lacked proof. Months later, he wrote, it was declassified and burned, though a few copies were kept and he saw one [10]. No copy is in this archive, and Ruppelt's account is the only source cited here for its contents.",
            "Popular accounts often say Vandenberg ordered every copy destroyed, but Ruppelt, the source of the story, says only that the Estimate was rejected, later declassified and burned, and that copies survived [10]. Records from the same weeks do survive. On 3 November 1948 Major General C. P. Cabell wrote to Air Materiel Command that the conclusion appeared inescapable that some type of flying object had been observed, and asked for its conclusions [8]. The command's reply of 8 November listed cigar-shaped aircraft without wings or fins among the reported types, said no physical evidence had been obtained, and found that there was as yet no conclusive proof these objects were real aircraft [9]."
          ],
          quote: {
            text: "The possibility that the reported objects are vehicles from another planet has not been ignored.",
            who: "Air Materiel Command reply to Headquarters USAF, 8 November 1948",
            src: 9
          }
        }
      ],
      timeline: [
        { date: "1948-07-23", event: "Eastern Air Lines Trip 576 leaves Houston at 8:40 p.m. EST, bound for Atlanta.", src: 2 },
        { date: "1948-07-24", event: "Between 0140 and 0150 EST a Robins AFB employee sees a cylindrical object trailing fire.", src: 4 },
        { date: "1948-07-24", event: "2:45 a.m.: Chiles and Whitted see a wingless, flame-trailing object about twenty miles southwest of Montgomery.", src: 1 },
        { date: "1948-08-03", event: "Chiles writes his statement for Eastern Air Lines in Atlanta.", src: 1 },
        { date: "1948-08-10", event: "The Office of Special Investigations interrogates the Robins AFB witness.", src: 4 },
        { date: "1948-11-03", event: "Maj. Gen. Cabell asks Air Materiel Command for its conclusions on flying objects.", src: 8 },
        { date: "1948-11-08", event: "Air Materiel Command replies that no physical evidence has been obtained.", src: 9 },
        { date: "1956", event: "Ruppelt publishes his account of the case and of the Estimate of the Situation.", src: 10 }
      ],
      sources: [
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-chileswhitted.pdf", page: 82, note: "Project Blue Book file (NARA): statement of Capt. Clarence S. Chiles, 3 Aug 1948" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-chileswhitted.pdf", page: 81, note: "Project Blue Book file (NARA): statement of co-pilot John B. Whitted" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-chileswhitted.pdf", page: 88, note: "Project Blue Book file (NARA): Air Force incident summary, 'TRUE UNKNOWN'" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-chileswhitted.pdf", page: 13, note: "Project Blue Book file (NARA): OSI interrogation of Robins AFB witness, 10 Aug 1948" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-chileswhitted.pdf", page: 31, note: "Project Blue Book file (NARA): Hynek's analysis of Incident #144, page 1" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-chileswhitted.pdf", page: 33, note: "Project Blue Book file (NARA): Hynek's analysis of Incident #144, page 3" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-chileswhitted.pdf", page: 71, note: "Project Blue Book file (NARA): evaluation sheet, 'Probable Astro (METEOR)'" },
        { id: "DOW-UAP-D100", page: 2, note: "Maj. Gen. Cabell to Air Materiel Command, 3 Nov 1948" },
        { id: "DOW-UAP-D100", page: 8, note: "Air Materiel Command reply, 8 Nov 1948" },
        { url: "https://www.gutenberg.org/ebooks/17346", note: "Edward J. Ruppelt, The Report on Unidentified Flying Objects (1956), chapter 3" }
      ],
      updated: "2026-10-03"
    },
  "levelland": {
      title: "Levelland 1957: stalled engines, six observers and a disputed ball-lightning verdict",
      sections: [
        {
          heading: "A night of calls in Hockley County",
          paras: [
            "An Associated Press story clipped into the Air Force file begins with Pedro Saucedo, 30, a farm hand and part-time barber, who told officers and newsmen that he was driving to a farm near the Pettit community, west of Levelland, Texas, on Saturday night with a friend, Joe Salaz. They first saw a flash of light in a field to their right. When it got near, he said, the truck's lights went out and the motor died; the thing passed directly over the truck with a great sound and a rush of wind, and he felt a lot of heat. Saucedo, a Korean War veteran, called it \"torpedo shaped\" or like \"a rocket,\" but much larger [8].",
            "The same story quotes Ronald Martin, 18, a Levelland truck driver, who said his engine died and his lights went out \"when a big ball of fire dropped on the highway\" east of town early Sunday. Police Patrolman A. J. Fowler said Saucedo and about 14 others called in reports, and that they seemed to agree the object was 200 feet long and shaped like an egg. Sheriff Weir Clem said he saw a brilliant light in the distance but did not get close enough for a good look; Highway Patrolmen Lee Hargrove and Floyd Cavin reported similar flashes in the sky in about the same area [8]."
          ],
          quote: {
            text: "I jumped out of the truck and hit the dirt because I was afraid.",
            who: "Pedro Saucedo, quoted by the Associated Press (clipping in the Blue Book file)",
            src: 8
          }
        },
        {
          heading: "What the Air Force recorded",
          paras: [
            "The Project 10073 record card, the file's index sheet, logs the sightings between 11:00 p.m. and 1:30 a.m. and gives the length of observation as three seconds to four minutes. It says the case triggered more than 300 similarly described reports within six days because of nationwide publicity, and that the object's size varied with six different observers, from a basketball to 800 feet in length. Most observers said it affected or stopped their cars' ignition, and the card notes that all but one mentioned lightning or lightning flashes and rain or mist in the area [1].",
            "A preliminary report teletyped on 7 November by the commander of the 1006th Air Intelligence Service Squadron lists the sources interrogated, among them Newel Wright and Sheriff Weir Clem, with the other names blacked out. According to the report, three sources were the only ones to report that the object landed and the only ones who saw it for more than a few seconds [2]. The investigator offered three possibilities: that with the amount of rain in the area, conditions might have developed for St. Elmo's fire or the like; excess gas burning from oil operations reflecting off a 400-foot cloud cover; or a downed power line sparking off wet ground. Dr. Ralph S. Underwood, a Texas Tech astronomy expert, called it a natural phenomenon not fully understood, possibly caused by rain, and said he did not personally believe the objects came from outer space [2][3].",
            "The squadron's UFO section was headed by Sgt. Norman P. Barth. In a memo of 19 February 1958 he wrote that all possible attempts had been made to locate the truck driver who was the prime source, whose name is redacted in the file. Contrary to newspaper reports, Barth wrote, the man did not live in Levelland and could not be contacted by the sheriff of Hockley County [6]."
          ]
        },
        {
          heading: "Weather, a distributor and a verdict",
          paras: [
            "A typed summary headed \"Levelland, Texas 'Blue Light' Case\" counts five witnesses reporting between 11 p.m. and midnight and describes objects round to oval, from the size of a baseball to a basketball, white with a greenish tint, blue or red. It gives the weather as a 400-foot overcast with three miles' visibility and drizzle or light rain throughout, after heavy thunderstorms just before the sightings. It concludes that the cause was probably ball lightning, attributes the stalled cars to moisture settling on distributor parts, and records that in one instance a faulty distributor was found to be the cause [4].",
            "Capt. George T. Gregory, the UFO project officer, signed the analyst's conclusion on 3 January 1958 under the heading \"Ball Lightning.\" He listed fog, light rain, mist, a 400-foot ceiling and lightning discharges, suggested that oil fires burning nearby contributed through an oil-saturated mist, and argued that ionized air near lightning could affect moisture-laden ignition components [5].",
            "Another Air Force summary in the file says investigations found that it was pitch dark, that rain and mist were falling, that excess gases from oil operations were being burned nearby, and that faulty ignition systems and near-freezing temperatures were found in some instances. It states that the sighting was concluded to be ball lightning and that the prime source could not be located for interview by USAF investigators, but it stops short on the cars [7]."
          ],
          quote: {
            text: "No definite conclusion has been reached regarding the possible effects of ball lightning on ignition systems.",
            who: "Air Force summary of the Levelland incident, Project Blue Book file",
            src: 7
          }
        },
        {
          heading: "Challenged before Congress",
          paras: [
            "At the House Committee on Science and Astronautics symposium on 29 July 1968, James E. McDonald, senior physicist at the University of Arizona's Institute of Atmospheric Physics, described Levelland in his prepared statement. In a two-hour period near midnight, he wrote, nine vehicles had ignition failures and many lost their headlights as objects about 100 to 200 feet long, glowing red or blue, were met on roads near the town. He said that on checking weather data he found no thunderstorms anywhere close to Levelland that night and no rain capable of wetting ignitions, and that Sheriff Clem and a Levelland newspaperman confirmed the absence of rain or lightning. He added that lights came back on and engines could be restarted as soon as the object receded, which he said made the wet-ignition explanation unreasonable [9].",
            "Robert L. Hall, head of the sociology department at the University of Illinois in Chicago, told the same hearing that there had been ten separate sightings near Levelland over about two and a half hours, by people including police officers, and that the car-stopping effect had not been publicized before these reports. He cited the case as evidence against mass hysteria [10].",
            "The weather record is itself in dispute: the Air Force summary describes heavy thunderstorms just before the sightings, while McDonald found none nearby [4][9]. Popular retellings speak of some fifteen stalled vehicles, but the documents do not support that count: the Air Force card lists six observers, McDonald counted nine vehicles and Hall ten sightings, and the figure of about fifteen comes from a patrolman's tally of people who telephoned in reports [1][9][10][8]. The record card still carries the case as ball lightning [1]."
          ],
          quote: {
            text: "The incidents cannot be regarded as explained.",
            who: "James E. McDonald, prepared statement to the House Committee on Science and Astronautics, 1968",
            src: 9
          }
        }
      ],
      timeline: [
        { date: "1957-11-02", event: "From about 11 p.m. to 1:30 a.m., drivers near Levelland report a glowing object and stalled engines.", src: 1 },
        { date: "1957-11-07", event: "The 1006th Air Intelligence Service Squadron teletypes its preliminary report on the Levelland investigation.", src: 2 },
        { date: "1958-01-03", event: "Capt. George T. Gregory signs the analyst's conclusion: \"Ball Lightning.\"", src: 5 },
        { date: "1958-02-19", event: "Sgt. Norman P. Barth reports that the prime source, a truck driver, could not be located.", src: 6 },
        { date: "1968-07-29", event: "McDonald and Hall discuss Levelland at the House symposium on UFOs.", src: 9 }
      ],
      sources: [
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 1, note: "Blue Book record card, Levelland (NARA file, scan via The Black Vault)" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 7, note: "1006th AISS preliminary report, 7 Nov 1957" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 12, note: "Preliminary report, page two: possibilities and Dr. Underwood" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 13, note: "\"Blue Light\" case summary: weather and distributor" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 17, note: "Capt. Gregory's analyst conclusion, 3 Jan 1958" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 20, note: "Sgt. Barth memo on the prime source, 19 Feb 1958" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 31, note: "Air Force incident summary: findings and conclusion" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-levellandufocase-november2-3-1957.pdf", page: 39, note: "AP clipping in the file: Saucedo, Martin, Fowler, Clem" },
        { url: "https://nicap.org/books/1968Sym/1968_UFO_Symposium.pdf", page: 73, note: "1968 House UFO symposium: McDonald's prepared statement" },
        { url: "https://nicap.org/books/1968Sym/1968_UFO_Symposium.pdf", page: 103, note: "1968 House UFO symposium: Hall's prepared statement" }
      ],
      updated: "2026-10-03"
    },
  "lubbock-lights": {
    title: "Lubbock Lights 1951: measured lights, unproven photos, an open file",
    sections: [
      {
        heading: "Lights over a professor's back yard",
        paras: [
          "In a briefing transcribed in March 1952, Captain Edward J. Ruppelt, who ran the Air Force's UFO investigation, told his audience about a case from Lubbock, Texas. Professors from Texas Tech were sitting in a back yard on 25 August 1951, discussing meteors, when a group of lights went over; about half an hour later, as they were wishing it would happen again, a second group passed [1].",
          "In his 1956 book Ruppelt put the first sighting at 9:20 p.m. and named four observers: geologist W. I. Robinson, chemical engineer A. G. Oberg, petroleum engineer W. L. Ducker and physicist Dr. George. He described the lights as bluish-green, fifteen to thirty of them in a rough semicircle, moving north to south [10]. His two accounts differ on details: the briefing speaks of five professors, twelve formations over five or six nights and a second pass after half an hour, the book of four professors, twelve more observations over the following weeks and a second pass after about an hour [1][10]."
        ],
        quote: {
          text: "the whole case is the most interesting one we've ever had.",
          who: "Capt. Edward J. Ruppelt, Air Force briefing, March 1952",
          src: 1
        }
      },
      {
        heading: "Thirty degrees per second",
        paras: [
          "According to the briefing, the professors at first assumed they were watching an Air Force missile and set up their own crude measurements: angles marked against the houses, a stopwatch, and a baseline at right angles to the path with two-way radios and homemade angle-measuring devices at each end, to get an altitude [1].",
          "The altitude attempt failed. What they did obtain was the angular speed across the sky, 30 degrees per second [2]. In the book Ruppelt explained why that settled nothing: at an assumed 10,000 feet the lights would have been travelling about 3,600 miles per hour, but nobody knew whether they were higher or lower than that [10]."
        ],
        quote: {
          text: "Now, that's the only measurement we've got on these things.",
          who: "Capt. Edward J. Ruppelt, Air Force briefing, March 1952",
          src: 2
        }
      },
      {
        heading: "Carl Hart's photographs",
        paras: [
          "The report of the Air Force Office of Special Investigations (OSI) records that a college freshman's pictures of the objects in formation appeared in the Morning Avalanche on 1 September 1951 [5]. On 20 September the OSI agent and Lt. John Farley of Reese Air Force Base interviewed him at home. He said that on the night of 30 August, about 11:30 p.m. CST, he was lying in bed watching the stars when a formation passed over the house. He took his 35 mm Kodak into the back yard, photographed a second formation at about 11:32 (two pictures) and a third at about 11:34 (three pictures). He could not find one of the negatives [5].",
          "He estimated that each formation held 18 or 20 objects in a U or rough V, white, not twinkling, with a glow comparable to the moon [5]. The agent's photo data name the photographer as Hart and list Plus-X film exposed at f/3.5 for 1/10 of a second; Hart also said he saw two more formations on 1 September at about 11:20 p.m. but took no pictures [6]. The agent described him as an 18-year-old freshman at Texas Technological College [7]. The photo file kept with the case holds four prints under the date 30 August 1951 [9]."
        ],
        quote: {
          text: "He seemed sincere in his efforts to relate all incidents to the best of his ability.",
          who: "OSI agent's assessment of the photographer, October 1951",
          src: 7
        }
      },
      {
        heading: "Real images, unproven origin",
        paras: [
          "Ruppelt told the 1952 audience that he had talked to Hart twice and that OSI had questioned him about three times. On the last occasion agents offered to let him withdraw the photos quietly; he refused and signed a sworn statement. The professors, Ruppelt said, rejected the photographs, because what they had seen was too dim ever to be photographed [2].",
          "The Air Force photo lab found that the negatives held actual images. The positions of the lights shifted slightly from frame to frame, and the density of the images was a little more than that of a bright planet [3]. In the book Ruppelt added that Hart could produce only four of his five negatives, that they were badly scratched, and that an attempt to repeat the shots with an identical camera produced only two badly blurred frames in four seconds. A physiologist and professional photographers told him this did not rule out Hart's account [10].",
          "Ruppelt's own accounts date the photographs to 31 August, while the OSI interview and the photo file give 30 August [2][5][9]. They also disagree with each other: in 1952 he quoted Hart as waiting two days before developing the film, in 1956 as developing it the next morning [3][10]."
        ],
        quote: {
          text: "The photos were never proven to be a hoax but neither were they proven to be genuine.",
          who: "Ruppelt's official conclusion, as quoted in his 1956 book",
          src: 10
        }
      },
      {
        heading: "Matador and the wider series",
        paras: [
          "The OSI investigation was opened on 17 September 1951 at the request of Reese Air Force Base, after a teletype from Air Materiel Command, and also covered a daytime report. A woman from Matador said that at 12:45 p.m. on 31 August a pear-shaped object flew about 200 feet in front of her car, five miles north of the town, then rose rapidly and moved away to the east in a circular pattern, with no exhaust or noise [4].",
          "The Project Blue Book record card for Matador gives an estimated size of 40 feet long and 16 feet in diameter, notes that the duration was too short for a balloon, and lists the case as unidentified [8]. Ruppelt filed it under the Lubbock Lights together with a Sandia Corporation employee's report of a silent flying wing over Albuquerque on the evening of 25 August, and a radar target in Washington State that ATIC's electronics specialists put down to weather [10]."
        ],
        quote: {
          text: "Object like a yellow pear-shaped tomato",
          who: "Project Blue Book record card, Matador, Texas, 31 August 1951",
          src: 8
        }
      },
      {
        heading: "Birds, and an answer never shown",
        paras: [
          "In 1952 Ruppelt said there had been a duck flight over Lubbock at the time, but attempts to photograph ducks at night by city light had failed, so if the photographs were not fakes they were not ducks; the professors rejected the duck idea outright [3]. His book describes a plover lead from an old man in Lamesa, a game warden's doubt that plovers fly in large flocks, and his own idea of birds reflecting mercury-vapour street lights, which could not explain reports from far away from those streets [10].",
          "Popular accounts say the Air Force closed the case as birds reflecting city lights over Ruppelt's objection; his book says the reverse on both counts. Officially all the sightings except the radar target were unknowns, while Ruppelt personally accepted an unnamed scientist's identification of the professors' lights as a commonplace natural phenomenon, an explanation he never described [10].",
          "No document in this file identifies what the professors or Hart saw. The OSI report of October 1951 ends with the case continuing in pending status, awaiting a lead from the OSI district in Lawton, Oklahoma [7]."
        ],
        quote: {
          text: "They weren't birds, they weren't refracted light, but they weren't spaceships.",
          who: "Edward J. Ruppelt, The Report on Unidentified Flying Objects, 1956",
          src: 10
        }
      }
    ],
    timeline: [
      { date: "1951-08-25", event: "About 9:20 p.m.: Texas Tech professors see the first formation of lights from a back yard in Lubbock.", src: 10 },
      { date: "1951-08-26", event: "The Avalanche Journal runs a story on the unidentified objects over Lubbock.", src: 7 },
      { date: "1951-08-30", event: "About 11:30 p.m. CST: Carl Hart Jr. photographs two formations from his back yard.", src: 5 },
      { date: "1951-08-31", event: "12:45 p.m.: a woman reports a pear-shaped object near Matador, Texas.", src: 8 },
      { date: "1951-09-01", event: "The Morning Avalanche publishes the freshman's photographs.", src: 5 },
      { date: "1951-09-07", event: "OSI District 23 files a Spot Intelligence Report on the Lubbock sightings.", src: 4 },
      { date: "1951-09-17", event: "Reese AFB requests an OSI investigation after a teletype from Air Materiel Command.", src: 4 },
      { date: "1951-09-20", event: "The OSI agent and Lt. John Farley interview Hart at his home.", src: 5 },
      { date: "1951-10-08", event: "OSI report of investigation issued; status pending.", src: 4 },
      { date: "1952-03", event: "Ruppelt briefs an audience on the case, calling it the most interesting the project has had.", src: 1 },
      { date: "1956", event: "Ruppelt publishes the full account in The Report on Unidentified Flying Objects.", src: 10 }
    ],
    sources: [
      { id: "DOW-UAP-D154", page: 6, note: "Transcript of a presentation by Capt. Edward J. Ruppelt, March 1952: the professors' first sightings and measurements" },
      { id: "DOW-UAP-D154", page: 7, note: "Same transcript: angular speed, Hart's photographs, OSI questioning, professors' objections" },
      { id: "DOW-UAP-D154", page: 8, note: "Same transcript: photo-lab findings and the duck theory" },
      { url: "https://commons.wikimedia.org/wiki/File:Project_Blue_Book_report_-_1951-08-7008697-Matador-Texas.pdf", page: 20, note: "Project Blue Book (NARA T1206) file: OSI Report of Investigation 24-84, 8 October 1951, synopsis" },
      { url: "https://commons.wikimedia.org/wiki/File:Project_Blue_Book_report_-_1951-08-7008697-Matador-Texas.pdf", page: 2, note: "Same OSI report, 'At Lubbock, Texas': interview with the photographer, 20 September 1951" },
      { url: "https://commons.wikimedia.org/wiki/File:Project_Blue_Book_report_-_1951-08-7008697-Matador-Texas.pdf", page: 3, note: "Same OSI report: negatives, 1 September sighting, camera and film data" },
      { url: "https://commons.wikimedia.org/wiki/File:Project_Blue_Book_report_-_1951-08-7008697-Matador-Texas.pdf", page: 4, note: "Same OSI report: description of the photographer, agent's assessment, case status, inclosures" },
      { url: "https://commons.wikimedia.org/wiki/File:Project_Blue_Book_report_-_1951-08-7008697-Matador-Texas.pdf", page: 1, note: "Project 10073 record card, Matador, Texas, 31 August 1951" },
      { url: "https://commons.wikimedia.org/wiki/File:Project_Blue_Book_report_-_1951-08-6982556-Lubbock-Texas.pdf", page: 1, note: "Project Blue Book photo file, Lubbock, Texas, 30 August 1951, 4 photos" },
      { url: "https://www.gutenberg.org/ebooks/17346", note: "Edward J. Ruppelt, The Report on Unidentified Flying Objects (1956), chapter 8, 'The Lubbock Lights, Unabridged'" }
    ],
    updated: "2026-10-03"
  },
  "mantell": {
      title: "Mantell 1948: a fatal climb, three versions of the last radio call, and a balloon no one could trace",
      sections: [
        {
          heading: "Calls from the state police",
          paras: [
            "The Project Blue Book summary of the Godman Field tower log starts at about 13:20 on 7 January 1948. A sergeant from the commanding officer's office told T/Sgt Quinton A. Blackwell in the control tower that, according to the Fort Knox Military Police and the Kentucky State Police, a large circular object about 250 to 300 feet in diameter was over \"Mansville, Ky.\" Army Flight Service reported nothing, but further reports soon placed the object over Irvington and then Owensboro. Blackwell first saw something himself at about 13:45 to 13:50, south of the field, and the base commander, Col. Guy F. Hix, saw it at about 14:20 [4].",
            "Capt. James F. Duesler, Jr., who went up to the tower with Lt. Col. E. G. Wood at about 14:20, said in a statement dated two days later that he first saw a bright silver object there [6]. The Air Materiel Command's first Project Sign report, dated 23 April 1948, lists eight separate reports from that day as incidents 33 to 33g. Their times run from 13:20 CST at Godman to 18:54–19:06 at Madisonville, Kentucky, and only one, 33f at 14:45, was observed from the air [1]. Ruppelt later noted that the tower witnesses could not agree on what they saw, describing everything from \"a parachute\" to \"an ice cream cone tipped with red\" [10]."
          ],
          quote: {
            text: "an object hanging high in the sky south of Godman",
            who: "Capt. James F. Duesler, Jr., statement of 9 January 1948",
            src: 6
          }
        },
        {
          heading: "The chase",
          paras: [
            "At about 14:30 to 14:40, the tower summary says, four P-51s approached Godman from the south on their way from Marietta, Georgia, to Standiford Field, Kentucky. Blackwell asked the flight leader, NG 869, to try to identify the object. He went south with two of the other planes, and the fourth continued to Standiford alone [4]. Duesler named the flight leader as Capt. Thomas F. Mantell and recorded that the pilot who left had said it was time for him to land [6].",
            "According to Duesler, Mantell reported 7,500 feet and climbing, then called out an object at twelve o'clock high that was bright and climbing away from him, moving at about half his speed, roughly 180 miles per hour. Later he said he was at 15,000 feet and still climbing after it, and judged its speed to be the same as his own. When another pilot asked him to level off, the tower heard no reply [6].",
            "The tower summary puts Mantell's last call, that he was trying to close in for a better look, at about 15:15. Five minutes later the other two planes turned back. One of their pilots, NG 800, said the object looked like the reflection of sunlight on an airplane canopy; he later searched again, up to 33,000 feet and 100 miles south, and saw nothing [4]. A 1964 Blue Book letter to the coroner of Simpson County records that an aircraft accident occurred at Franklin, Kentucky, in January 1948, and that the county coroner examined the body of the pilot, Captain Thomas F. Mantell, Jr. [7]."
          ]
        },
        {
          heading: "What did he say?",
          paras: [
            "The phrase most associated with the case, that the object was metallic and of tremendous size, appears in only one of four accounts of the radio traffic that the investigators collected. Col. Hix remembered only the object travelling at 180 miles per hour, half the pilot's speed. 1st Lt. Orner heard \"high and traveling about 1/2 my speed at 12 o'clock position\" and then \"Closing in to take a good look\". Capt. Cary W. Carter recalled the object going up and forward as fast as the pilot and the words \"going to 20,000 ft and if no closer will abandon chase\". Only Blackwell's version includes the metallic description [5]. Duesler's statement does not mention it either [6].",
            "Intelligence studies repeated Blackwell's wording anyway. An Air Intelligence Division study dated 10 December 1948 described a National Guard pilot killed while chasing an unidentified object \"up to 30,000 feet\" and quoted his last message to the tower as \"it appears to be metallic object.... of tremendous size\" [2]. That altitude is not given anywhere in the radio accounts, which stop at 15,000 feet and a stated plan to go to 20,000 [5]. Ruppelt later wrote that everyone in the tower agreed on \"I'm going to 20,000 feet\" but not on the part about the object being metallic and tremendous [10]."
          ],
          quote: {
            text: "It appears metallic of tremendous size.",
            who: "NG 869 (Capt. Mantell), as recalled by T/Sgt Quinton A. Blackwell",
            src: 5
          }
        },
        {
          heading: "Venus, then a balloon",
          paras: [
            "The first explanation was the planet Venus. In August 1948 a bright object seen from Godman, which an F-51 flying over the base at 30,000 to 35,000 feet could not locate, was identified as Venus by an astronomer at the University of Louisville, and the Air Force study that reported this added that the earlier Godman incidents may also have been Venus [3].",
            "Astronomer J. Allen Hynek's analysis for the Air Force, printed in the 1949 Project Grudge report, was more cautious. He wrote that the evening sightings on 7 January were undoubtedly Venus, but that no single explanation of the daytime sightings worked without relying heavily on coincidence. He suggested more than one object had been involved, possibly Venus in the fatal chase and balloons elsewhere [9]. He also noted an unofficial report that the object was a Navy cosmic ray balloon [8]."
          ],
          quote: {
            text: "If this can be established, it is to be preferred as an explanation.",
            who: "J. Allen Hynek, Project Grudge report, Appendix B, 1949",
            src: 8
          }
        },
        {
          heading: "Ruppelt's answer",
          paras: [
            "Edward J. Ruppelt, who ran Project Blue Book, reopened the case in early 1952 after a query from the Pentagon. He found that the 1949 microfilm of the file was partly ruined. Hynek told him he did not think the object was Venus, because the planet would have been only about six times as bright as the surrounding sky. Ruppelt then considered the 100-foot-diameter Skyhook balloons, a project he described as highly classified at the time. Wind data he obtained showed that a balloon launched from Clinton County AFB in southern Ohio could have passed the Kentucky towns in the order the reports came in and then drifted south of Godman [10].",
            "He never found a launch record for a balloon on 7 January 1948, and people who had worked on the early Skyhook flights would say only that one was possible. Retellings that present Ruppelt as a dissenter who privately considered the case unexplained have it backwards: in his own 1956 book he argued that assuming a balloon makes the whole picture fall into place, and the answer he phoned back to the Pentagon favoured the balloon [10]. The file is also thinner than legend suggests. Blue Book's 1964 letter to the coroner states that the Wright-Patterson case file held information on the wreckage but nothing on the pilot's condition [7]."
          ],
          quote: {
            text: "It could have been a balloon.",
            who: "Edward J. Ruppelt, The Report on Unidentified Flying Objects, 1956",
            src: 10
          }
        }
      ],
      timeline: [
        { date: "1948-01-07", event: "About 13:20: the Godman Field tower hears of state police reports of a large circular object.", src: 4 },
        { date: "1948-01-07", event: "About 13:45–13:50: T/Sgt Blackwell first sees the object south of the field; Col. Hix sees it at about 14:20.", src: 4 },
        { date: "1948-01-07", event: "About 14:30–14:40: four National Guard P-51s pass Godman; flight leader NG 869 is asked to identify the object.", src: 4 },
        { date: "1948-01-07", event: "About 14:45: NG 869 reports the object ahead and above, moving at about half his speed.", src: 5 },
        { date: "1948-01-07", event: "About 15:15: last call from NG 869; Capt. Mantell later dies in a crash at Franklin, Kentucky.", src: 7 },
        { date: "1948-01-07", event: "18:54–19:06: a further report comes from Madisonville, Kentucky (incident 33g).", src: 1 },
        { date: "1948-01-09", event: "Capt. James F. Duesler, Jr. signs his account of the radio traffic heard in the tower.", src: 6 },
        { date: "1948-04-23", event: "Air Materiel Command's first Project Sign report lists the day's reports as incidents 33 to 33g.", src: 1 },
        { date: "1948-08-19", event: "Another bright object over Godman is identified as Venus; earlier Godman incidents are linked to it.", src: 3 },
        { date: "1948-12-10", event: "Air Intelligence Division Study 203 quotes the pilot's last message.", src: 2 },
        { date: "1949", event: "Project Grudge report prints Hynek's analysis: evening sightings were Venus; a balloon is preferred if confirmed.", src: 8 },
        { date: "1956", event: "Ruppelt's book concludes that the object could have been a Skyhook balloon.", src: 10 },
        { date: "1964-07-23", event: "Blue Book asks the Simpson County coroner for medical records on Mantell for the FAA.", src: 7 }
      ],
      sources: [
        { id: "DOW-UAP-D097", page: 4, note: "Project Sign initial report (23 April 1948): incidents 33 to 33g" },
        { id: "DOW-UAP-D093", page: 29, note: "Air Intelligence Division Study 203 (10 December 1948): National Guard pilot's last message" },
        { id: "DOW-UAP-D094", page: 21, note: "Analysis of Flying Object Incidents: 19 August 1948 Godman object identified as Venus" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-thomasmantell-allfiles.pdf", page: 10, note: "Project Blue Book Mantell case file (NARA microfilm, copy via The Black Vault): summary of the Godman tower log" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-thomasmantell-allfiles.pdf", page: 35, note: "Project Blue Book Mantell case file: four accounts of the radio conversation with NG 869" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-thomasmantell-allfiles.pdf", page: 36, note: "Project Blue Book Mantell case file: statement of Capt. James F. Duesler, Jr., 9 January 1948" },
        { url: "https://documents2.theblackvault.com/documents/projectbluebook/projectbluebook-thomasmantell-allfiles.pdf", page: 22, note: "Project Blue Book Mantell case file: letter to the Simpson County coroner, 23 July 1964" },
        { url: "https://commons.wikimedia.org/wiki/File:Project_Grudge_Report,_1949.pdf", page: 78, note: "Project Grudge report (Technical Report 102-AC 49/15-100), Hynek, Incident 33, page 5: Navy cosmic ray balloon" },
        { url: "https://commons.wikimedia.org/wiki/File:Project_Grudge_Report,_1949.pdf", page: 79, note: "Project Grudge report, Hynek, Incident 33, page 6: summing up" },
        { url: "https://www.gutenberg.org/ebooks/17346", note: "Edward J. Ruppelt, The Report on Unidentified Flying Objects (1956), Chapter Three" }
      ],
      updated: "2026-10-03"
    },
  "mcminnville": {
      title: "McMinnville 1950: two photographs, one wire and a verdict that never ruled out a model",
      sections: [
        {
          heading: "A disk over the farmyard",
          paras: [
            "The Condon Report's case study puts the sighting on the witnesses' farm, about 10 miles southwest of McMinnville, Oregon, on 11 May 1950. The accounts it drew on give the time as 7:45 p.m. or 7:30 p.m. PST, and describe the weather as dull with an overcast at about 5,000 feet. The first witness, the farmer's wife, was feeding rabbits in the back yard, south of the house and east of the garage, when she saw the object [1].",
            "According to the same study, the couple first looked for their camera in the car before she remembered it was in the house. It was already loaded, with two or three shots on a roll bought that winter. Her husband took one picture, wound the film on and moved to his right to take a second. He estimated that both were taken within thirty seconds. The object then moved off rapidly toward the west [2]. Paul Trent's camera was later identified as a Roamer 1 made by the Universal Camera Corporation, with a shutter fixed at about 1/50 second [8]."
          ],
          quote: {
            text: "the object was coming in toward us and seemed to be tipped up a little bit.",
            who: "Witness account quoted in the Condon Report, Case 46",
            src: 2
          }
        },
        {
          heading: "From a davenport to the front page",
          paras: [
            "The Trents did not seek publicity. The Condon study records that they were afraid of getting into trouble with the government. Bill Powell, a reporter for the McMinnville Telephone Register, heard about the photographs from two local bankers, Ralph and Frank Wortman. He found the negatives on the floor under a davenport, where the Trents' children had been playing with them [3]. Bruce Maccabee, who later spoke with Evelyn Trent many times, gives a slightly different route: a relative's boyfriend suggested showing the photos to the banker Frank Wortmann, who then called the newspaper [8].",
            "The Telephone Register ran the story and both pictures on its front page on Thursday, 8 June 1950. Portland and Los Angeles papers followed on 9 and 10 June, and Life magazine printed the pictures the following week. The couple then travelled to New York to appear on the television programme \"We the People\" [3].",
            "The negatives were not returned to them. The Condon study says the Colorado project found that the negatives had gone to the International News Photo Service, later part of United Press International, and was allowed to examine them [4]. Maccabee writes that UPI sent them to the McMinnville paper's editor in 1970, and that he found them on the editor's desk in 1975 [8]."
          ],
          quote: {
            text: "Expert photographers declared there has been no tampering with the negatives.",
            who: "Editor's note, McMinnville Telephone Register, 8 June 1950, quoted in the Condon Report",
            src: 3
          }
        },
        {
          heading: "Hartmann's tests in 1967",
          paras: [
            "William Hartmann, the Colorado project's investigator, interviewed the Trents about 17 years after the sighting [1]. He found it hard to see any motive for a fabrication, though he noted that afterwards the witnesses did profit to the extent of a trip to New York. He also raised a possible problem himself: the object, the telephone pole and a distant house are lit from the east, and the shadows could suggest the photographs were taken on a dull but sunlit day at, say, 10 a.m. [4].",
            "His tests made an optical fabrication seem remote, and a model thrown into the air by hand unlikely, because the object showed no sign of rotation. The test that mattered most pointed the other way. In both pictures the object hangs beneath roughly the same point on a pair of overhead wires, even though the camera had moved. Between the two shots the disk is about 8% farther away and the wires about 10% farther away [5].",
            "Hartmann then measured brightness on the original negatives. To match the photographs, he found, a small model would have needed a very white surface on its shaded underside. As far as the photometry was reliable, it pointed to an object with a bright, shiny surface, at considerable distance and tens of metres across [6]."
          ],
          quote: {
            text: "These tests do not rule out the possibility that the object was a small model suspended from the nearby wire by an unresolved thread.",
            who: "William K. Hartmann, Condon Report, Case 46",
            src: 5
          }
        },
        {
          heading: "What the Condon verdict actually says",
          paras: [
            "Hartmann's conclusion is often cited as an endorsement of the photographs. It does open by calling McMinnville one of the few reports in which all factors investigated appear consistent with an extraordinary flying object, but it goes straight on to the caveat quoted below. In the same passage Hartmann notes that the object's position under the same part of the wire in both photos can be used to argue for a suspended model [6].",
            "Retellings often say the Air Force analysed the negatives in 1950 and that the Condon Report declared the photographs authentic. The documents show neither: the negatives sat with a news agency until the Colorado project tracked them down [4], Maccabee calls Hartmann's 1967 work the first scientific analysis of the sighting [8], and Hartmann wrote that a fabrication had not been ruled out [6]."
          ],
          quote: {
            text: "It cannot be said that the evidence positively rules out a fabrication",
            who: "Condon Report, Case 46, conclusion",
            src: 6
          }
        },
        {
          heading: "Shadows, weather and a thread",
          paras: [
            "In an unpublished paper written in November 1969, Robert Sheaffer argued that the sharp shadows on the garage wall were cast directly by the sun, low in the east, at about 8:20 a.m. Pacific Daylight Time. He also cited Weather Bureau records from McMinnville that show perfectly clear skies at 6:00 and 7:00 p.m. on 11 May, not the overcast the witnesses described [7]. Maccabee writes that Hartmann later said Sheaffer's work removed the case from consideration as evidence for disk-like craft [8].",
            "Maccabee re-examined the original negatives from 1975 onwards. He argued that a cloud could have produced sharp shadows on the east wall, and concluded that the case could not be proven a hoax and that the evidence indicated it was not one [8].",
            "In 2013 three researchers from the French group IPACO analysed scans of the negatives with image-analysis software. They judged a small object hanging below a power wire to be the most convincing explanation [9]. A follow-up study that June reported finding traces of a suspension thread in both pictures [10]. No official finding has settled the case."
          ],
          quote: {
            text: "the hypothesis of a small object hanging below a power wire is the most convincing.",
            who: "Cousyn, Louange and Quick, IPACO report, 2013",
            src: 9
          }
        }
      ],
      timeline: [
        { date: "1950-05-11", event: "Evening: two photographs of a disk-shaped object are taken on the Trent farm southwest of McMinnville.", src: 2 },
        { date: "1950-06-08", event: "The McMinnville Telephone Register runs both photographs on its front page.", src: 3 },
        { date: "1950-06-10", event: "Portland and Los Angeles newspapers have carried the story; Life prints the pictures the following week.", src: 3 },
        { date: "1967", event: "William Hartmann of the Colorado project interviews the Trents and examines the original negatives.", src: 4 },
        { date: "1969-11", event: "Robert Sheaffer writes his paper arguing the shadows show morning sunlight.", src: 7 },
        { date: "1975", event: "Bruce Maccabee finds the negatives at the McMinnville newspaper and begins his analysis.", src: 8 },
        { date: "2013-04", event: "IPACO publishes its analysis favouring a model hanging from a power wire.", src: 9 },
        { date: "2013-06", event: "IPACO adds a study reporting a suspension thread in both photographs.", src: 10 }
      ],
      sources: [
        { url: "https://archive.org/download/DTIC_AD0680976/DTIC_AD0680976.pdf", page: 186, note: "Condon Report vol. 2, Case 46: background" },
        { url: "https://archive.org/download/DTIC_AD0680976/DTIC_AD0680976.pdf", page: 187, note: "Condon Report vol. 2, Case 46: the sighting" },
        { url: "https://archive.org/download/DTIC_AD0680976/DTIC_AD0680976.pdf", page: 189, note: "Condon Report vol. 2, Case 46: publicity" },
        { url: "https://archive.org/download/DTIC_AD0680976/DTIC_AD0680976.pdf", page: 190, note: "Condon Report vol. 2, Case 46: negatives and lighting" },
        { url: "https://archive.org/download/DTIC_AD0680976/DTIC_AD0680976.pdf", page: 193, note: "Condon Report vol. 2, Case 46: wire test" },
        { url: "https://archive.org/download/DTIC_AD0680976/DTIC_AD0680976.pdf", page: 204, note: "Condon Report vol. 2, Case 46: conclusion" },
        { url: "https://web.archive.org/web/20161226085549/http://www.debunker.com/texts/trent1969.html", note: "Robert Sheaffer, An Investigation of the McMinnville UFO Photographs (1969)" },
        { url: "https://web.archive.org/web/20211202060406/http://brumac.mysite.com/trent2.html", note: "Bruce Maccabee, The McMinnville Photos (1981, notes 2000)" },
        { url: "https://www.ipaco.fr/ReportMcMinnville.pdf", page: 24, note: "IPACO, The McMinnville pictures: conclusion" },
        { url: "https://www.ipaco.fr/ReportMcMinnville.pdf", page: 1, note: "IPACO, The McMinnville pictures: thread study summary" }
      ],
      updated: "2026-10-03"
    },
};
