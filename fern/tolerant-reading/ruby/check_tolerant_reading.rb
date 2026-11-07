# frozen_string_literal: true

# Reads the fixtures the way the client reads an annotation list and a form response.
require "cloudpdf"

list = CloudPDF::Types::AnnotationList.load(File.read(ENV.fetch("CLOUDPDF_ANNOTATIONS_FIXTURE")))
puts "annotations: #{list.annotations.length}"
form = CloudPDF::Types::DocFormsListResponse.load(File.read(ENV.fetch("CLOUDPDF_FORM_FIXTURE")))
puts "fields: #{form.fields.length}"
