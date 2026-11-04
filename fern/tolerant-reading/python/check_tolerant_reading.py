# Reads the fixture the way the client reads an annotation list response.
import json
import os
import sys
import typing

import pydantic
from cloudpdf.core.pydantic_utilities import parse_obj_as
from cloudpdf.types.annotation_list import AnnotationList

with open(os.environ["CLOUDPDF_FIXTURE"], encoding="utf-8") as fixture:
    body = json.load(fixture)

annotations = typing.cast(AnnotationList, parse_obj_as(type_=AnnotationList, object_=body)).annotations
print(f"annotations: {len(annotations)}")
if [annotation.subtype for annotation in annotations] != ["square", "unsupported", "widget"]:
    sys.exit(f"read {[annotation.subtype for annotation in annotations]}")

# A subtype it knows, malformed, still fails.
malformed = {**body, "annotations": [{**body["annotations"][0], "rect": "wide"}]}
try:
    parse_obj_as(type_=AnnotationList, object_=malformed)
except pydantic.ValidationError:
    print("a malformed square still fails")
else:
    sys.exit("read a malformed square")
