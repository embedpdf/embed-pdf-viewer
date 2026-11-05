# frozen_string_literal: true

# Reads the fixture the way the client reads an annotation list response.
require "cloudpdf"

list = CloudPDF::Types::AnnotationList.load(File.read(ENV.fetch("CLOUDPDF_FIXTURE")))
puts "annotations: #{list.annotations.length}"
