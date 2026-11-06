# Reads the fixtures the way the client reads an annotation list and a form response.
import json
import os
import sys
import typing

import pydantic
from cloudpdf.core.pydantic_utilities import parse_obj_as
from cloudpdf.types.annotation_list import AnnotationList
from cloudpdf.types.doc_forms_list_response import DocFormsListResponse

with open(os.environ["CLOUDPDF_ANNOTATIONS_FIXTURE"], encoding="utf-8") as fixture:
    body = json.load(fixture)

annotations = typing.cast(AnnotationList, parse_obj_as(type_=AnnotationList, object_=body)).annotations
print(f"annotations: {len(annotations)}")
if [annotation.subtype for annotation in annotations] != ["square", "unsupported", "widget", "line", "link"]:
    sys.exit(f"read {[annotation.subtype for annotation in annotations]}")
_, _, _, line, link = annotations
if line.measure.subtype != "unknown":
    sys.exit(f"read a measure of an unknown subtype as {line.measure.subtype}")
if link.target.kind != "unsupported":
    sys.exit(f"read a link target of an unknown kind as {link.target.kind}")
if link.actions.activate.root.type != "unknown":
    sys.exit(f"read an action of an unknown type as {link.actions.activate.root.type}")

# A subtype it knows, malformed, still fails.
malformed = {**body, "annotations": [{**body["annotations"][0], "rect": "wide"}]}
try:
    parse_obj_as(type_=AnnotationList, object_=malformed)
except pydantic.ValidationError:
    print("a malformed square still fails")
else:
    sys.exit("read a malformed square")

with open(os.environ["CLOUDPDF_FORM_FIXTURE"], encoding="utf-8") as fixture:
    form = typing.cast(DocFormsListResponse, parse_obj_as(type_=DocFormsListResponse, object_=json.load(fixture)))

print(f"fields: {len(form.fields)}")
text, barcode = form.fields
if [text.kind, barcode.kind] != ["text", "unknown"]:
    sys.exit(f"read {[field.kind for field in form.fields]}")
if text.value_entry.kind != "unsupported":
    sys.exit(f"read a value of an unknown kind as {text.value_entry.kind}")
if barcode.raw_value != "":
    sys.exit(f"read an unknown field's missing rawValue as {barcode.raw_value!r}")
