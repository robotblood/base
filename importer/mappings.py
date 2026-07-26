"""Per-database mapping specs: how each Notion CSV maps onto a model.

`fields` values are either a column name (str, copied verbatim) or a callable
taking the row dict and returning the value. Missing columns yield None, so a
spec is tolerant of minor export differences.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Type

from app import models
from importer import notion as nd

RB = "Robotblood/ca1bd093011e4c1881a7b00532e7b58e"
PS = "Private & Shared"


@dataclass
class Spec:
    source: str  # human label, stored in `source`
    csv: str  # path relative to the export root
    model: Type
    title_cols: list[str]  # first non-empty wins -> title/name field
    fields: dict[str, str | Callable] = field(default_factory=dict)
    tags_from: str | None = None
    # Tags every row from this database gets, on top of `tags_from`. Provenance
    # the CSV doesn't carry — an EIPA-era database is EIPA whether or not any
    # row says so, and re-importing must not drop that.
    extra_tags: list[str] = field(default_factory=list)
    load_bodies: bool = False
    defaults: dict = field(default_factory=dict)


SPECS: list[Spec] = [
    # ---- TODOS ---------------------------------------------------------
    Spec("Tasks", f"{PS}/Admin/Tasks a0da95e8e57c4baf9b44d5455a50a08b_all.csv",
         models.Todo, ["Name"],
         {"assignee": "Assignee", "status": "Status",
          "due": lambda r: nd.parse_date(r.get("Due"))},
         tags_from="Tags"),
    Spec("Task tracker", f"{PS}/Task tracker 9170d2cdaf7e40a6964f458e03d09053_all.csv",
         models.Todo, ["Task"],
         {"assignee": "Assignee", "status": "Status", "priority": "Priority",
          "due": lambda r: nd.parse_date(r.get("Due date"))},
         tags_from="Tags"),
    Spec("IT Issue Tracker", f"{RB}/IT Issue Tracker/IT Issue Tracker 121842a197ea81cf8e5cd1d36e926c55_all.csv",
         models.Todo, ["Name"],
         {"assignee": "Assignee", "status": "Status", "priority": "Priority",
          "due": lambda r: nd.parse_date(r.get("Due"))},
         tags_from="Ticket Type"),

    # ---- NOTES & MEETINGS ---------------------------------------------
    Spec("Notes and Meetings", f"{PS}/Admin/Notes and Meetings 297a46c489ca47c591219dc3dc4f2f36_all.csv",
         models.Note, ["Name"],
         {"status": "Status", "meeting_type": "Meeting Type",
          "attendees": lambda r: nd.split_tags(r.get("Attendees")),
          "meeting_time": lambda r: nd.parse_datetime(r.get("Meeting time"))},
         tags_from="Categories", load_bodies=True, defaults={"kind": "meeting"}),
    Spec("Session Meeting Notes", f"{RB}/Live Series/Session Meeting Notes 261842a197ea816e8219efc1cb1a9775_all.csv",
         models.Note, ["Name"],
         {"status": "Meeting Status",
          "attendees": lambda r: nd.split_tags(r.get("Participants")),
          "meeting_time": lambda r: nd.parse_datetime(r.get("Start of Meeting"))},
         load_bodies=True, defaults={"kind": "meeting"}),
    Spec("Journal", f"{PS}/Journal 06677fc1bfe344ecb01a7727cb091587_all.csv",
         models.Note, ["Name"],
         {}, tags_from="Tags", load_bodies=True, defaults={"kind": "journal"}),

    # ---- EVENTS / CALENDAR --------------------------------------------
    Spec("Performances", f"{RB}/Admin/Performances d2f86fefdb9e4a0c93eca692db2f7cfb_all.csv",
         models.Event, ["Name"],
         {}, tags_from="Tags", defaults={"kind": "performance"}),

    # ---- HARDWARE ------------------------------------------------------
    Spec("Hardware", f"{RB}/Admin/Hardware 52b4738e430248ab9095bb327f2dccec_all.csv",
         models.Hardware, ["Name"],
         {"cpu": "CPU", "category": "Category", "company": "Company",
          "quantity": lambda r: nd.to_int(r.get("Number")),
          "power_w": lambda r: nd.to_float(r.get("Power Consumption (W)"))}),

    # ---- SOFTWARE ------------------------------------------------------
    Spec("Software", f"{RB}/Admin/Software cef04bc2ad554ebeb1f57c8c57c03264_all.csv",
         models.Software, ["Name"], {"url": "URL"}, tags_from="Tags"),

    # ---- PROJECTS ------------------------------------------------------
    Spec("Projects", f"{RB}/Admin/Projects d3f7e2d163b44719aa1eaba09ac11d34_all.csv",
         models.Project, ["Name"], {}, tags_from="Tags"),
    Spec("Live Series Projects", f"{RB}/Live Series/PROJECTS 261842a197ea815481b3dc8724d79b3e_all.csv",
         models.Project, ["Name"], {}, tags_from="Type"),

    # ---- MEDIA ---------------------------------------------------------
    Spec("Audio Tracks", f"{RB}/Admin/Audio Tracks 3f89a880641043f09bc11d6755aa303f_all.csv",
         models.Media, ["Name"], {"duration": "Duration"},
         tags_from="Tags", defaults={"media_type": "audio"}),
    Spec("Audio Loops", f"{RB}/Live Series/AUDIO_LOOPS 261842a197ea81ca9673fda3256f39a2_all.csv",
         models.Media, ["Name"], {"duration": "Duration"},
         defaults={"media_type": "audio"}),
    Spec("Tracks", f"{PS}/Tracks f35b100fcd954885822a18d601df592e_all.csv",
         models.Media, ["Track Name", "Name"], {"duration": "Length"},
         defaults={"media_type": "track"}),
    Spec("Moodboard", f"{RB}/Admin/Moodboard 2e22cd57ceae4a50bf76a3141de63136_all.csv",
         models.Media, ["Name"], {}, tags_from="Tags", defaults={"media_type": "visual"}),
    Spec("Visual Comps", f"{RB}/Admin/Visual Comps cbd14a079401453791fb5b87279db23b_all.csv",
         models.Media, ["Name"], {}, tags_from="Tags", defaults={"media_type": "visual"}),

    # ---- PEOPLE --------------------------------------------------------
    Spec("People", f"{PS}/People d3d842a197ea82dfb0d8014512d331ec_all.csv",
         models.Person, ["Name"], {"about": "About", "membership_type": "Membership Type"}),

    # ---- JOB APPLICATIONS ----------------------------------------------
    Spec("Job Applications",
         f"{PS}/Main Hub/🚀 Job Search Hub — Personal Site Project/"
         "🎯 Job Applications c169ae124bc046d1b990e4be4a6c265f_all.csv",
         models.JobApplication, ["Role"],
         {"company": "Company", "status": "Status", "priority": "Priority",
          "location": "Location", "contact": "Contact", "posting_url": "Job Posting",
          "salary_range": "Salary Range", "resume_version": "Resume Version",
          "found_via": "Source", "track": "Track", "next_action": "Next Action",
          "notes": "Notes",
          "applied": lambda r: nd.parse_date(r.get("Date Applied")),
          "follow_up": lambda r: nd.parse_date(r.get("Follow-up Date"))}),

    # ---- MONEY ----------------------------------------------------------
    Spec("Transaction Logs",
         f"{PS}/Budget Tracker/Transaction Logs/"
         "Transaction Logs 17d842a197ea819785b9d631f3bfc018_all.csv",
         models.Transaction, ["Transaction Name"],
         {"amount": lambda r: nd.to_float(r.get("Transaction Amount")),
          "occurred_on": lambda r: nd.parse_date(r.get("Transaction Date")),
          "kind": lambda r: nd.money_kind(r.get("Transaction Type"))}),
    # Two Notion databases, one shape: a planned envelope and a standing bill
    # both answer "what do I owe, how often".
    Spec("Budget", f"{PS}/Budget Tracker/Budget/Budget 17d842a197ea817f8cacc1560c9ce8b5_all.csv",
         models.Budget, ["Budget Name"],
         {"frequency": "Frequency",
          "amount": lambda r: nd.to_float(r.get("Budget Amount")),
          "starts_on": lambda r: nd.parse_date(r.get("Start Date")),
          "ends_on": lambda r: nd.parse_date(r.get("End Date"))}),
    Spec("Budget Expenses",
         f"{PS}/Admin/Budget Expenses 22e8a0b4739f47869c78486acf1a2d9a_all.csv",
         models.Budget, ["Name"],
         {"frequency": "Billing Cycle",
          "amount": lambda r: nd.to_float(r.get("Cost")),
          "last_paid": lambda r: nd.parse_date(r.get("Last Paid Date")),
          "paid": lambda r: nd.to_bool(r.get("Paid"))}),

    # ---- LEARNING --------------------------------------------------------
    Spec("Continuing Education",
         f"{RB}/Admin/Continuing Education 5a868a0263fa4174bdb0151117fceaf8_all.csv",
         models.Learning, ["Name"],
         {"status": "Status", "url": "URL", "via": "Source"}, tags_from="Tags"),

    # ---- INCIDENTS -------------------------------------------------------
    # Every row in this database is from the EIPA years, so provenance is a
    # property of the database, not of any one row. Tagged here rather than
    # patched afterwards so re-importing keeps it.
    Spec("Incident Log",
         f"{PS}/Admin/Incident Log 9b6d80c502254c7f9500dc66d1620a0e_all.csv",
         models.Incident, ["Incident"],
         {"status": "Status", "reported_by": "Reported By", "details": "Details",
          "occurred_on": lambda r: nd.parse_date(r.get("Date"))},
         tags_from="Type", extra_tags=["EIPA"]),

    # ---- COLLECTIONS -----------------------------------------------------
    # Small databases kept whole rather than modelled. Each row's original
    # columns survive in `raw`; `summary` is just enough to recognise it.
    # Hidden from the sidebar — see /admin.
    *[
        Spec(label, csv, models.Collection, [title_col],
             {"collection": (lambda lbl: lambda r: lbl)(label),
              "summary": (lambda tc: lambda r: nd.one_line(r, skip=(tc,)))(title_col)},
             tags_from=tags_col)
        for label, csv, title_col, tags_col in [
            ("Shopping List",
             f"{PS}/Admin/Shopping List 11c842a197ea8008a15ae2f9e21de705_all.csv",
             "Name", "Tags"),
            ("Ingredients",
             f"{PS}/Admin/Ingredients 12c842a197ea80c18124d09cbfd2dfef_all.csv",
             "Name", None),
            ("Spending Categories",
             f"{PS}/Budget Tracker/Spending Categories/"
             "Spending Categories 17d842a197ea81d5961cf09d99be1156_all.csv",
             "Category Name", None),
            ("Sprints", f"{PS}/Admin/Sprints f769f6b15d3246eda38e4fd766817554_all.csv",
             "Sprint name", None),
            ("ADHD Tracker",
             f"{PS}/Admin/ADHD Tracker 12c842a197ea807dafc4d3bf985c8ac2_all.csv",
             "Name", "Tags"),
            ("Nebraska Native Plants",
             f"{PS}/Nebraska Native Plant Journey/NE Native Plant Admin/"
             "Nebraska Native Plants 201842a197ea803c9201fa6ba0389bca_all.csv",
             "Plant Name", None),
            ("Pollinators",
             f"{PS}/Nebraska Native Plant Journey/NE Native Plant Admin/"
             "Pollinators 201842a197ea80b8bc70f575715f20dd_all.csv",
             "Name", None),
            ("Rich Fucking Losers",
             "Zine/171842a197ea81fba707004254959b18/"
             "RichFuckingLosers 192842a197ea80a6955df487bbd6a8b7_all.csv",
             "Name", None),
            ("Claude Skills",
             f"{RB}/Claude/Skills 291842a197ea805ea4d3db681686555b_all.csv",
             "Name", "tags"),
        ]
    ],
]
