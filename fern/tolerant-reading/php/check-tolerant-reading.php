<?php

// Reads the fixture the way the client reads an annotation list response.
require __DIR__ . '/vendor/autoload.php';

use CloudPDF\Types\AnnotationList;

$list = AnnotationList::fromJson(file_get_contents(getenv('CLOUDPDF_FIXTURE')));
echo 'annotations: ' . count($list->annotations) . "\n";
