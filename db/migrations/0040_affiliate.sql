-- 0040_affiliate.sql: Amazon Associates "Go Deeper" book picks as data.
-- Source of truth for rendering stays worker/lib/affiliate.ts (build-time import);
-- this table is the queryable system of record (ASINs, blurbs, topic mapping).

CREATE TABLE IF NOT EXISTS affiliate_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL UNIQUE,
  creator TEXT NOT NULL,
  blurb TEXT NOT NULL,
  query TEXT NOT NULL,
  asin TEXT,
  match_keywords TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('The UFO Experience', 'J. Allen Hynek', 'Written by Blue Book''s own chief scientist — the astronomer who classified the very cases in this archive, and who went from skeptic to believer.', 'The UFO Experience J Allen Hynek', '1590033086', 'blue book,hynek', 'project-blue-book', 0);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('The Hynek UFO Report', 'J. Allen Hynek', 'A case-by-case walkthrough of hundreds of Blue Book files — the same incidents you''re browsing, analyzed by the insider who read them all.', 'Hynek UFO Report', '1982187210', 'blue book', 'project-blue-book', 1);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('Project Blue Book Declassified', 'U.S. Air Force (official files)', 'The complete official Blue Book files in book form — every status report 1952–1969, unfiltered, for the shelf.', 'Project Blue Book Declassified book', NULL, 'blue book,project sign,grudge', 'project-blue-book', 2);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('The Coming of the Saucers', 'Kenneth Arnold', 'By the pilot whose 1947 sighting coined ''flying saucer'' — the origin story of every disc report in this collection.', 'Coming of the Saucers Kenneth Arnold', '1585092262', 'flying disc,flying saucer,kenneth arnold,1947', 'flying-discs', 3);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('Flying Saucers Are Real', 'Donald Keyhoe', 'The 1950 bestseller by a Marine Corps major that forced the Air Force to answer for the saucer wave, using the same era''s official files.', 'Flying Saucers Are Real Donald Keyhoe', '8986476010', 'flying disc,flying saucer,keyhoe', 'flying-discs', 4);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('UFOs and Nukes', 'Robert Hastings', '40 years, 160+ military witnesses: the definitive investigation of UFOs over nuclear weapons sites — the incidents in this archive are its source material.', 'UFOs and Nukes Robert Hastings', '1544822197', 'nuclear,oak ridge,los alamos,missile,silo,warhead', 'nuclear-sites', 5);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('Skinwalkers at the Pentagon', 'Lacatski, Kelleher & Knapp', 'By the creator of the Pentagon''s secret AAWSAP program itself — the insider account of the program behind these documents.', 'Skinwalkers at the Pentagon Lacatski', 'B09HR54GQF', 'aawsap,dird,aatip,bigelow,skinwalker', 'aawsap', 6);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('Imminent', 'Luis Elizondo', 'By the former Pentagon UAP official whose testimony drove the congressional hearings — the insider story behind the push for disclosure.', 'Imminent Luis Elizondo', '0063235560', 'elizondo,congress,hearing,uaptf,aaro,grusch', 'congress', 7);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('The FBI-CIA-UFO Connection', 'Bruce Maccabee', 'A Navy physicist documents — from declassified files — how deeply the FBI and CIA tracked UFOs through the Cold War. The files you''re reading are his evidence.', 'FBI CIA UFO Connection Maccabee', '1502317214', 'fbi,62-hq-83894,cia,hoover', 'fbi-62-hq-83894', 8);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('UFOs and the National Security State', 'Richard Dolan', 'The definitive history of the intelligence community''s 50-year entanglement with UFOs — CIA, NSA, and the cover apparatus behind the documents.', 'UFOs and the National Security State Dolan', '1571743170', 'cia,nsa,intelligence community,national security', '', 9);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('Inside The Black Vault', 'John Greenewald', 'By the man behind the world''s largest FOIA UFO archive — how he pried these very documents out of the government, and what he learned.', 'Inside The Black Vault Greenewald', '1538118378', 'foia,black vault', '', 10);
INSERT INTO affiliate_picks (title, creator, blurb, query, asin, match_keywords, topics, sort) VALUES ('UFO: The Inside Story', 'Garrett Graff', 'A Pulitzer finalist traces the government''s 80-year search — from Roswell to the UAP hearings — through declassified documents like these.', 'UFO Inside Story Garrett Graff', '1982196777', 'roswell,congress,disclosure', 'congress', 11);
