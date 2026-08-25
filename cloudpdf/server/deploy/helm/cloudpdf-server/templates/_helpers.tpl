{{- define "cloudpdf-server.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cloudpdf-server.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "cloudpdf-server.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cloudpdf-server.labels" -}}
helm.sh/chart: {{ include "cloudpdf-server.chart" . }}
{{ include "cloudpdf-server.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "cloudpdf-server.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cloudpdf-server.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "cloudpdf-server.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "cloudpdf-server.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "cloudpdf-server.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}
{{- end -}}

{{/* Non-empty when the deployment is scaled beyond one replica (or can
     scale itself there via the HPA). */}}
{{- define "cloudpdf-server.scaled" -}}
{{- if or (gt (int .Values.replicaCount) 1) .Values.autoscaling.enabled -}}true{{- end -}}
{{- end -}}

{{/* Effective Deployment strategy: explicit wins; otherwise Recreate
     with a PVC (RWO cannot be shared by old + new pods) and a
     zero-downtime RollingUpdate without one. */}}
{{- define "cloudpdf-server.strategy" -}}
{{- if .Values.strategy.type -}}
type: {{ .Values.strategy.type }}
{{- else if .Values.persistence.enabled -}}
type: Recreate
{{- else -}}
type: RollingUpdate
rollingUpdate:
  maxUnavailable: 0
  maxSurge: 1
{{- end -}}
{{- end -}}

{{/* The safety gates: misconfiguration dies at render time, not in
     production. Reads the documented `config.*` surface only — env via
     extraEnv/extraEnvFrom is outside gate jurisdiction (see values.yaml,
     `gates.allowExternalConfig`). */}}
{{- define "cloudpdf-server.validate" -}}
{{- $cfg := .Values.config | default dict -}}
{{- $driver := (get $cfg "CLOUDPDF_DB_DRIVER") | default "sqlite" -}}
{{- $storage := (get $cfg "CLOUDPDF_STORAGE_KIND") | default "fs" -}}
{{- $scaled := (include "cloudpdf-server.scaled" .) -}}
{{- if and $scaled (not .Values.gates.allowExternalConfig) -}}
{{- if or (eq $driver "sqlite") (eq $storage "fs") -}}
{{- fail (printf "cloudpdf-server: replicaCount > 1 (or autoscaling) requires config.CLOUDPDF_DB_DRIVER=postgres and a shared object store (config.CLOUDPDF_STORAGE_KIND=s3|gcs|azure-blob); got driver=%q storage=%q. SQLite and fs storage are single-replica only. If these genuinely arrive via external env, set gates.allowExternalConfig=true." $driver $storage) -}}
{{- end -}}
{{- end -}}
{{- if and $scaled .Values.persistence.enabled -}}
{{- fail "cloudpdf-server: persistence (the SQLite/fs PVC profile) is single-replica: its RWO volume and single-writer database cannot back multiple pods. Set replicaCount=1 and disable autoscaling, or move to the Postgres + object-storage profile." -}}
{{- end -}}
{{- if and $scaled (eq ((get $cfg "CLOUDPDF_REALTIME") | default "") "in-process") -}}
{{- fail "cloudpdf-server: config.CLOUDPDF_REALTIME=in-process breaks cross-replica SSE delivery. Remove it (Postgres LISTEN/NOTIFY is the default) or run a single replica." -}}
{{- end -}}
{{- if and .Values.migrations.enabled .Values.persistence.enabled -}}
{{- fail "cloudpdf-server: migrations.enabled cannot combine with persistence — the hook Job cannot share an RWO volume with the running pod. The persistence profile migrates at boot: set config.CLOUDPDF_AUTO_MIGRATE=\"1\" and migrations.enabled=false." -}}
{{- end -}}
{{- if and .Values.migrations.enabled (eq $driver "sqlite") (not .Values.gates.allowExternalConfig) -}}
{{- fail "cloudpdf-server: the migrate hook Job requires a shared database (config.CLOUDPDF_DB_DRIVER=postgres). The sqlite profile migrates at boot: set config.CLOUDPDF_AUTO_MIGRATE=\"1\" and migrations.enabled=false." -}}
{{- end -}}
{{- end -}}

{{/* envFrom for the app Deployment: release ConfigMap + the secret. */}}
{{- define "cloudpdf-server.envFrom" -}}
{{- if .Values.config }}
- configMapRef:
    name: {{ include "cloudpdf-server.fullname" . }}
{{- end }}
{{- if .Values.existingSecret }}
- secretRef:
    name: {{ .Values.existingSecret }}
{{- else if .Values.secrets }}
- secretRef:
    name: {{ include "cloudpdf-server.fullname" . }}
{{- end }}
{{- with .Values.extraEnvFrom }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* envFrom for the migrate hook Job. Helm creates pre-install hooks
     BEFORE ordinary release resources exist, and runs pre-upgrade hooks
     BEFORE the release ConfigMap is updated — so the Job consumes
     hook-scoped copies (created fresh at weight -10 every operation),
     never the release ConfigMap. `existingSecret` predates the release
     by definition and is referenced directly. */}}
{{- define "cloudpdf-server.migrateEnvFrom" -}}
{{- if .Values.config }}
- configMapRef:
    name: {{ include "cloudpdf-server.fullname" . }}-migrate
{{- end }}
{{- if .Values.existingSecret }}
- secretRef:
    name: {{ .Values.existingSecret }}
{{- else if .Values.secrets }}
- secretRef:
    name: {{ include "cloudpdf-server.fullname" . }}-migrate
{{- end }}
{{- with .Values.extraEnvFrom }}
{{ toYaml . }}
{{- end }}
{{- end -}}
