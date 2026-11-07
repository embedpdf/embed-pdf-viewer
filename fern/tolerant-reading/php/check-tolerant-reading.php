<?php

// Reads the fixtures the way the client reads an annotation list and a form response.
require __DIR__ . '/vendor/autoload.php';

use CloudPDF\Types\AnnotationList;
use CloudPDF\Types\DocFormsListResponse;

$list = AnnotationList::fromJson(file_get_contents(getenv('CLOUDPDF_ANNOTATIONS_FIXTURE')));
echo 'annotations: ' . count($list->annotations) . "\n";
$form = DocFormsListResponse::fromJson(file_get_contents(getenv('CLOUDPDF_FORM_FIXTURE')));
echo 'fields: ' . count($form->fields) . "\n";
