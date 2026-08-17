<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { localeHomePath, type AppLocale } from '../i18n'
import { applyLegalSeo } from '../composables/useDocumentSeo'
import TopbarSettings from '../components/TopbarSettings.vue'
import ProtectedEmail from '../components/ProtectedEmail.vue'

const { t, locale } = useI18n()
const homePath = computed(() => localeHomePath(locale.value as AppLocale))

onMounted(() => {
  applyLegalSeo({
    title: 'Datenschutzerklärung – UltraPlaner',
    description:
      'Datenschutzerklärung von UltraPlaner: Verarbeitung personenbezogener Daten, Firebase-Hosting, Standortnutzung, anonyme Sitzungszählung und Ihre Rechte nach DSGVO.',
    path: '/datenschutz/',
  })
})
</script>

<template>
  <div class="legal-page">
    <header class="legal-top">
      <router-link class="back-btn" :to="homePath">
        {{ t('landing.backHome') }}
      </router-link>
      <TopbarSettings brutal force-menu />
    </header>

    <article class="privacy-policy">
      <h1>Datenschutzerklärung</h1>

      <p class="stand">Stand: 17. August 2026</p>

      <h2>1. Verantwortlicher</h2>

      <p>Verantwortlicher für die Verarbeitung personenbezogener Daten auf der Website und in der Android-App UltraPlaner ist:</p>

      <p>
        Alexandre Berthier<br />
        Adolf-Czettel-Gasse 9<br />
        1160 Wien<br />
        Österreich
      </p>

      <p>
        E-Mail:
        <ProtectedEmail />
      </p>

      <p class="contact-hint">{{ t('legal.contactHint') }}</p>

      <h2>2. Allgemeine Hinweise</h2>

      <p>
        Der Schutz Ihrer personenbezogenen Daten ist uns wichtig. Wir verarbeiten personenbezogene
        Daten ausschließlich im Rahmen der geltenden datenschutzrechtlichen Vorschriften,
        insbesondere der Datenschutz-Grundverordnung (DSGVO), des österreichischen
        Datenschutzgesetzes (DSG) und des Telekommunikationsgesetzes 2021 (TKG 2021).
      </p>

      <p>
        Personenbezogene Daten sind alle Informationen, die sich auf eine identifizierte oder
        identifizierbare natürliche Person beziehen. Dazu können insbesondere Name, E-Mail-Adresse,
        IP-Adresse, Standort- und Routendaten sowie Inhalte von Kontaktanfragen gehören.
      </p>

      <p>
        Auf dieser Website werden keine Drittanbieter-Analyse- oder Marketingdienste wie Google
        Analytics oder Firebase Analytics eingesetzt. Es findet keine Erstellung personenbezogener
        Nutzerprofile und kein verhaltensbasiertes Tracking über mehrere Websites hinweg statt.
      </p>

      <p>
        Zur groben Messung der Nutzung (z. B. wie viele Besuche pro Tag) zählen wir anonym, wie oft
        die Anwendung in einer Browsersitzung geöffnet wird. Dabei wird nur ein grober Seitentyp
        erfasst (z. B. Startseite oder Kartenansicht), keine vollständigen URLs mit Karten-IDs,
        keine Cookies für Statistik und keine Weitergabe an Werbenetzwerke. Rechtsgrundlage ist
        Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an der technischen Verbesserung des
        Angebots). Details siehe Abschnitt „Cookies“ und „Supabase“.
      </p>

      <h2>3. Hosting der Website</h2>

      <h3>Firebase Hosting</h3>

      <p>Diese Website wird über Firebase Hosting bereitgestellt. Firebase ist ein Dienst der:</p>

      <p>
        Google Ireland Limited<br />
        Gordon House<br />
        Barrow Street<br />
        Dublin 4<br />
        Irland
      </p>

      <p>
        Beim Aufruf der Website verarbeitet Firebase Hosting technisch erforderliche
        Verbindungsdaten. Dazu können insbesondere die IP-Adresse, der Zeitpunkt des Aufrufs, die
        aufgerufene Ressource, Browserinformationen und Angaben zum Betriebssystem gehören.
      </p>

      <p>
        Diese Verarbeitung ist erforderlich, um die Website auszuliefern, ihre Stabilität und
        Sicherheit zu gewährleisten und missbräuchliche Zugriffe zu erkennen.
      </p>

      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse besteht in der
        sicheren, zuverlässigen und technisch fehlerfreien Bereitstellung unseres Online-Angebots.
      </p>

      <p>
        Firebase Hosting wird über eine globale technische Infrastruktur betrieben. Daher kann
        nicht vollständig ausgeschlossen werden, dass personenbezogene Daten auch außerhalb des
        Europäischen Wirtschaftsraums verarbeitet werden. Soweit erforderlich, stützt Google
        internationale Datenübermittlungen auf geeignete Garantien, insbesondere
        Standardvertragsklauseln der Europäischen Kommission oder einen anwendbaren
        Angemessenheitsbeschluss.
      </p>

      <p>
        Weitere Informationen:
        <a
          href="https://firebase.google.com/support/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Datenschutz und Sicherheit bei Firebase
        </a>
      </p>

      <h2>4. Technische App-Infrastruktur</h2>

      <h3>Supabase</h3>

      <p>
        Für die technische Bereitstellung von Datenbank- und Backend-Funktionen verwenden wir
        Supabase, einen Dienst der Supabase Inc.
      </p>

      <p>
        Supabase kann insbesondere für die Speicherung, Bereitstellung und Verarbeitung von
        Anwendungsdaten eingesetzt werden. Abhängig von der verwendeten Funktion können dabei
        folgende Daten verarbeitet werden:
      </p>

      <ul>
        <li>IP-Adresse und technische Verbindungsdaten,</li>
        <li>Zeitpunkt und Art einer Anfrage,</li>
        <li>angeforderte API-Ressourcen,</li>
        <li>Routen-, Karten- oder Standortdaten,</li>
        <li>Daten, die aktiv in der Anwendung eingegeben oder gespeichert werden.</li>
      </ul>

      <p>
        Supabase wird nicht zur verhaltensbasierten Analyse, zur Erstellung von Nutzerprofilen oder
        für personalisierte Werbung eingesetzt. Für eine anonyme Besucherzählung (siehe Abschnitt 2)
        werden ausschließlich aggregierte Tageszähler ohne personenbezogene Profile gespeichert.
      </p>

      <p>
        Die Verarbeitung erfolgt, soweit sie für die Bereitstellung der Anwendungsfunktionen
        notwendig ist, auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO. In allen anderen Fällen erfolgt
        sie auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse besteht in der
        sicheren und effizienten Bereitstellung der technischen Anwendungsinfrastruktur.
      </p>

      <p>
        Supabase-Projekte werden in einer beim Anlegen des Projekts ausgewählten Serverregion
        betrieben. Supabase bietet unter anderem Serverregionen innerhalb der Europäischen Union an.
      </p>

      <p>
        Supabase kann zur Erbringung seiner Leistungen weitere technische Dienstleister einsetzen.
        Soweit personenbezogene Daten außerhalb des Europäischen Wirtschaftsraums verarbeitet
        werden, erfolgt dies auf Grundlage geeigneter datenschutzrechtlicher Garantien.
      </p>

      <p>
        Soweit Supabase personenbezogene Daten in unserem Auftrag verarbeitet, erfolgt der Einsatz
        auf Grundlage einer Vereinbarung zur Auftragsverarbeitung gemäß Art. 28 DSGVO.
      </p>

      <p>
        Weitere Informationen:
        <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">
          Datenschutzerklärung von Supabase
        </a>
      </p>

      <h2>5. Kontaktaufnahme</h2>

      <h3>Kontaktformular und Web3Forms</h3>

      <p>
        Auf dieser Website steht ein Kontaktformular zur Verfügung. Für die technische Verarbeitung
        und Weiterleitung der Kontaktanfragen verwenden wir Web3Forms, einen Dienst von Web3Creative.
      </p>

      <p>Über das Kontaktformular werden folgende Daten verarbeitet:</p>

      <ul>
        <li>Name,</li>
        <li>E-Mail-Adresse,</li>
        <li>Inhalt der Nachricht,</li>
        <li>Zeitpunkt der Übermittlung,</li>
        <li>IP-Adresse und technische Verbindungsinformationen.</li>
      </ul>

      <p>
        Die Daten werden über die Server von Web3Forms verarbeitet und anschließend an unser
        E-Mail-Postfach weitergeleitet.
      </p>

      <p>
        Bei Nutzung des kostenlosen Web3Forms-Tarifs werden Formulareinsendungen nach Angaben von
        Web3Forms für 30 Tage gespeichert. Danach werden sie automatisch aus dem Web3Forms-System
        gelöscht.
      </p>

      <p>
        Unabhängig davon kann die weitergeleitete Nachricht in unserem E-Mail-Postfach gespeichert
        bleiben. Dort wird sie gelöscht, sobald die Anfrage abschließend bearbeitet wurde und keine
        gesetzlichen Aufbewahrungspflichten oder berechtigten Gründe für eine weitere Speicherung
        bestehen.
      </p>

      <p>
        Web3Forms verwendet nach eigenen Angaben unter anderem Infrastruktur von Amazon Web Services,
        Amazon SES, Cloudflare und Hetzner. Zur Erkennung und Abwehr von Spam können die IP-Adresse
        und die E-Mail-Adresse außerdem an Dienste wie CleanTalk oder Akismet übermittelt werden.
      </p>

      <p>
        Web3Forms wird von Indien aus betrieben. Im Rahmen der technischen Leistungserbringung kann
        es daher zu einer Verarbeitung personenbezogener Daten außerhalb des Europäischen
        Wirtschaftsraums kommen.
      </p>

      <p>
        Web3Forms gibt an, internationale Datenübermittlungen auf geeignete Garantien, insbesondere
        Standardvertragsklauseln, zu stützen.
      </p>

      <p>
        Soweit Ihre Anfrage auf den Abschluss oder die Durchführung eines Vertrags gerichtet ist,
        erfolgt die Verarbeitung auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO.
      </p>

      <p>
        In allen anderen Fällen erfolgt die Verarbeitung auf Grundlage von Art. 6 Abs. 1 lit. f
        DSGVO. Unser berechtigtes Interesse besteht in der effizienten Bearbeitung von
        Kontaktanfragen sowie in der Verhinderung missbräuchlicher oder automatisierter Nachrichten.
      </p>

      <p>
        Web3Forms verarbeitet die Formulardaten als Auftragsverarbeiter. Für die Verarbeitung stellt
        Web3Forms eine Vereinbarung zur Auftragsverarbeitung zur Verfügung.
      </p>

      <p>
        Weitere Informationen:
        <a href="https://web3forms.com/privacy" target="_blank" rel="noopener noreferrer">
          Datenschutzerklärung von Web3Forms
        </a>
      </p>

      <h2>6. Karten und Routendarstellung</h2>

      <h3>OpenStreetMap und externe Kartenserver</h3>

      <p>
        Auf dieser Website werden Kartendaten des OpenStreetMap-Projekts verwendet. Die
        Kartendarstellung dient insbesondere der Anzeige und Planung von Routen sowie der
        Darstellung von Orten und Punkten entlang einer Route.
      </p>

      <p>Zur Darstellung der Karten können Kartenkacheln insbesondere von folgenden Diensten geladen werden:</p>

      <ul>
        <li>OpenFreeMap beziehungsweise tiles.openfreemap.org,</li>
        <li>CyclOSM beziehungsweise tile-cyclosm.openstreetmap.fr.</li>
      </ul>

      <p>
        Beim Abruf von Kartenkacheln stellt der Browser eine Verbindung zu den jeweiligen
        Kartenservern her. Dabei können insbesondere folgende Daten verarbeitet werden:
      </p>

      <ul>
        <li>IP-Adresse,</li>
        <li>Zeitpunkt der Anfrage,</li>
        <li>angeforderter Kartenausschnitt und Zoomstufe,</li>
        <li>Browser- und Geräteinformationen,</li>
        <li>die zuvor besuchte Seite beziehungsweise Referrer-Informationen.</li>
      </ul>

      <p>
        Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes
        Interesse besteht in der Bereitstellung einer funktionalen Karten-, Routenplanungs- und
        Navigationsfunktion.
      </p>

      <p>
        OpenFreeMap gibt an, keine Tracking-Technologien oder Cookies zur Verfolgung von Nutzern
        einzusetzen und IP-Adressen standardmäßig nicht in gewöhnlichen Serverprotokollen zu
        speichern. Bei Sicherheitsvorfällen kann eine vorübergehende Protokollierung erfolgen.
      </p>

      <p>
        Die verwendeten Kartendaten stammen von OpenStreetMap und den Mitwirkenden des
        OpenStreetMap-Projekts.
      </p>

      <h3>OpenRouteService</h3>

      <p>
        Für die Berechnung und Verarbeitung von Routen verwenden wir OpenRouteService. Der Dienst
        wird von der HeiGIT gGmbH in Deutschland bereitgestellt.
      </p>

      <p>Für eine Routenberechnung werden insbesondere folgende Daten an OpenRouteService übertragen:</p>

      <ul>
        <li>Start-, Ziel- und Zwischenkoordinaten,</li>
        <li>das ausgewählte Fortbewegungs- oder Routenprofil,</li>
        <li>weitere Einstellungen der Routenberechnung,</li>
        <li>IP-Adresse oder die IP-Adresse unseres vermittelnden Servers,</li>
        <li>Zeitpunkt und technische Informationen zur API-Anfrage.</li>
      </ul>

      <p>
        Standort- und Routendaten können personenbezogen sein, wenn sie einen Rückschluss auf den
        Wohnort, Arbeitsplatz, Aufenthaltsort oder die Bewegungen einer Person ermöglichen.
      </p>

      <p>
        Die Verarbeitung erfolgt zur Berechnung und Bereitstellung der vom Nutzer angeforderten
        Route auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO. Soweit kein Vertragsverhältnis besteht,
        erfolgt sie auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse
        besteht in der Bereitstellung der Routenplanungsfunktion.
      </p>

      <p>
        HeiGIT gibt an, vollständige Anfragedaten grundsätzlich nach sieben Tagen zu löschen.
        Bestimmte nicht personenbezogene oder anonymisierte Metadaten können länger gespeichert
        werden. Koordinaten können hierfür auf eine geringere geografische Genauigkeit reduziert
        werden.
      </p>

      <p>
        Weitere Informationen:
        <a
          href="https://account.heigit.org/info/transparency-statement"
          target="_blank"
          rel="noopener noreferrer"
        >
          Datenschutzhinweise und Transparenzinformationen von HeiGIT
        </a>
      </p>

      <h3>Wahoo Cloud API</h3>

      <p>
        Optional können Sie Ihren Wahoo-Account mit UltraPlaner verbinden und eine Route inkl.
        Favoriten/Kontrollpunkten in die Wahoo-Cloud senden. Die Verbindung erfolgt über OAuth
        (PKCE) bei Wahoo Fitness. UltraPlaner speichert dabei Access- und Refresh-Token lokal im
        Browser dieses Geräts — ohne eigenes UltraPlaner-Benutzerkonto. Mit „Wahoo trennen“ werden
        die Tokens gelöscht.
      </p>

      <p>Beim Verbinden und Senden können insbesondere folgende Daten an Wahoo übertragen werden:</p>

      <ul>
        <li>OAuth-Zustimmung und Token-Austausch mit api.wahooligan.com,</li>
        <li>Routenname sowie FIT-Datei mit Track und Wegpunkten (Favoriten/Kontrollpunkte),</li>
        <li>technische Metadaten der Route (Startkoordinaten, Distanz, Höhenmeter).</li>
      </ul>

      <p>
        Die Verarbeitung erfolgt nur nach Ihrer aktiven Handlung (Verbinden / Senden) auf Grundlage
        von Art. 6 Abs. 1 lit. b DSGVO beziehungsweise Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
        Interesse an der Geräte-Integration). Anbieter ist Wahoo Fitness; es gelten die
        Datenschutzbestimmungen von Wahoo.
      </p>

      <h2>7. Wetterdaten</h2>

      <h3>Open-Meteo</h3>

      <p>Zur Anzeige von Wetterinformationen entlang einer Route verwenden wir die Wetter-API von Open-Meteo. Betreiber ist:</p>

      <p>
        OpenMeteo GmbH<br />
        Hintere Schilligmatte 6<br />
        6463 Bürglen (UR)<br />
        Schweiz
      </p>

      <p>Für die Abfrage von Wetterinformationen werden insbesondere folgende Daten an Open-Meteo übertragen:</p>

      <ul>
        <li>geografische Koordinaten,</li>
        <li>angefragter Zeitraum,</li>
        <li>gewünschte Wetterparameter,</li>
        <li>IP-Adresse oder die IP-Adresse unseres vermittelnden Servers,</li>
        <li>URL und technische Informationen der API-Anfrage.</li>
      </ul>

      <p>
        Die geografischen Koordinaten dienen ausschließlich dazu, Wetterdaten für den ausgewählten
        Ort oder entlang der geplanten Route abzurufen.
      </p>

      <p>
        Die Verarbeitung erfolgt zur Bereitstellung der angeforderten Wetterinformationen auf
        Grundlage von Art. 6 Abs. 1 lit. b DSGVO. Soweit kein Vertragsverhältnis besteht, erfolgt sie
        auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse besteht in der
        Bereitstellung relevanter Wetterinformationen für die Routenplanung.
      </p>

      <p>
        Open-Meteo gibt an, dass Serverprotokolle für technische Fehleranalyse und
        Missbrauchsprävention geführt werden können. Diese Protokolle können IP-Adressen, angefragte
        URLs und geografische Koordinaten enthalten und werden nach Angaben von Open-Meteo nach 90
        Tagen gelöscht.
      </p>

      <p>
        Weitere Informationen:
        <a href="https://open-meteo.com/en/terms" target="_blank" rel="noopener noreferrer">
          Datenschutzinformationen von Open-Meteo
        </a>
      </p>

      <h2>8. Standortdaten</h2>

      <h3>Gerätstandort (Fahrt und Fahrtmodus)</h3>

      <p>
        Wenn Sie die Funktionen „Fahrt“ oder den Fahrtmodus nutzen, greift die Anwendung auf
        Ihren aktuellen Gerätstandort zu. Im Browser geschieht das über die Geolocation-Schnittstelle.
        In der Android-App holt UltraPlaner zuvor die Systemberechtigung „Beim Verwenden der App“
        ein; der Standort wird nicht im Hintergrund erfasst, wenn die App nicht sichtbar ist.
      </p>

      <p>Die Standortdaten werden insbesondere verwendet, um:</p>

      <ul>
        <li>Versorgungspunkte in der Nähe Ihres Standorts anzuzeigen,</li>
        <li>Ihre Position auf der Karte im Fahrtmodus darzustellen,</li>
        <li>damit zusammenhängende Entfernungs- und Navigationshinweise zu berechnen.</li>
      </ul>

      <p>
        Der Zugriff auf den Standort erfolgt nur nach Ihrer Freigabe im Browser bzw. auf dem Gerät
        und nur, solange die jeweilige Funktion aktiv ist. Ohne diese Freigabe stehen die genannten
        Funktionen nicht oder nur eingeschränkt zur Verfügung.
      </p>

      <p>
        Wir nutzen Standortdaten nicht zur dauerhaften Nachverfolgung Ihres Bewegungsprofils, nicht
        zur Erstellung personenbezogener Nutzerprofile und nicht für personalisierte Werbung.
      </p>

      <p>
        Je nach Funktion können Standortdaten vorübergehend im Browser verarbeitet und, soweit für
        die von Ihnen angeforderte Funktion erforderlich, an unsere technischen Dienstleister
        (insbesondere Karten-, Routing- oder Backend-Dienste) übermittelt werden. Dabei können auch
        die IP-Adresse und technische Verbindungsdaten anfallen.
      </p>

      <p>
        Die Verarbeitung erfolgt zur Bereitstellung der von Ihnen angeforderten Standortfunktionen
        auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO. Soweit kein Vertragsverhältnis besteht, erfolgt
        sie auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse besteht in der
        Bereitstellung einer funktionalen Fahrt- und Fahrtmodus-Darstellung.
      </p>

      <p>
        Sie können die Standortfreigabe jederzeit in den Einstellungen Ihres Browsers oder Geräts
        widerrufen oder einschränken.
      </p>

      <h2>9. Cookies und vergleichbare Technologien</h2>

      <p>
        Wir verwenden keine Analyse-, Marketing- oder Tracking-Cookies. Insbesondere werden weder
        Firebase Analytics noch Google Analytics eingesetzt.
      </p>

      <p>
        Zur anonymen Besucherstatistik setzen wir <strong>keine Cookies</strong> ein, sondern
        speichern in <code>sessionStorage</code> des Browsers nur, ob in dieser Sitzung bereits
        gezählt wurde (einmal pro Tab-Sitzung). Beim ersten Aufruf sendet die App einen aggregierten
        Zählimpuls an unseren eigenen Supabase-Server (grober Seitentyp, kein Karten-Link). Es
        entstehen keine Nutzerprofile und kein websiteübergreifendes Tracking.
      </p>

      <p>
        Zusätzlich speichert die Website lokal im Browser (localStorage / vergleichbare Speicherungen)
        technisch nützliche Einstellungen, insbesondere:
      </p>

      <ul>
        <li>Ihre Sprachauswahl,</li>
        <li>Ihre Darstellungseinstellungen (z. B. Farbenfehlsicht-Modus),</li>
        <li>lokale App-Einstellungen und Offline-Cache für Routen und POIs.</li>
      </ul>

      <p>
        Diese Speicherungen dienen der von Ihnen gewählten Darstellung bzw. der Benutzerfreundlichkeit.
        Soweit sie technisch unbedingt erforderlich sind, erfolgt der Einsatz im Rahmen von § 165 Abs. 3
        TKG 2021; im Übrigen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.
      </p>

      <p>
        Es werden keine Marketing-Cookies und kein websiteübergreifendes Tracking für Werbung
        eingesetzt.
      </p>

      <h2>10. Empfänger personenbezogener Daten</h2>

      <p>
        Personenbezogene Daten werden nur weitergegeben, wenn dies zur Bereitstellung der Website
        oder einer angeforderten Funktion, zur Bearbeitung einer Anfrage, zur Vertragserfüllung, zur
        Erfüllung einer gesetzlichen Verpflichtung oder zur Wahrung eines berechtigten Interesses
        erforderlich ist.
      </p>

      <p>Empfänger oder Kategorien von Empfängern können insbesondere sein:</p>

      <ul>
        <li>Hosting- und Infrastruktur-Dienstleister (Firebase / Google),</li>
        <li>Datenbank- und Backend-Dienstleister,</li>
        <li>E-Mail- und Kontaktformular-Dienstleister,</li>
        <li>Karten-, Routing- und Wetterdatenanbieter,</li>
        <li>Spam- und Missbrauchsschutzdienste,</li>
        <li>Behörden bei Vorliegen einer gesetzlichen Verpflichtung.</li>
      </ul>

      <h2>11. Speicherdauer</h2>

      <p>
        Personenbezogene Daten werden grundsätzlich nur so lange gespeichert, wie dies für den
        jeweiligen Verarbeitungszweck erforderlich ist.
      </p>

      <p>
        Daten werden anschließend gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten,
        berechtigten Interessen oder sonstigen gesetzlichen Gründe für eine weitere Speicherung
        bestehen.
      </p>

      <p>Für einzelne Dienste gelten die in den jeweiligen Abschnitten genannten Speicherfristen.</p>

      <h2>12. Datensicherheit</h2>

      <p>
        Wir treffen angemessene technische und organisatorische Maßnahmen, um personenbezogene Daten
        vor Verlust, Missbrauch, unberechtigtem Zugriff, Veränderung oder Offenlegung zu schützen.
      </p>

      <p>
        Diese Website verwendet eine SSL- beziehungsweise TLS-Verschlüsselung. Eine verschlüsselte
        Verbindung erkennen Sie insbesondere daran, dass die Adresse der Website mit „https://“
        beginnt.
      </p>

      <p>
        Trotz angemessener Sicherheitsmaßnahmen kann eine vollständig risikofreie Datenübertragung
        über das Internet nicht garantiert werden.
      </p>

      <h2>13. Rechte betroffener Personen</h2>

      <p>Ihnen stehen nach Maßgabe der gesetzlichen Voraussetzungen insbesondere folgende Rechte zu:</p>

      <ul>
        <li>Recht auf Auskunft gemäß Art. 15 DSGVO,</li>
        <li>Recht auf Berichtigung gemäß Art. 16 DSGVO,</li>
        <li>Recht auf Löschung gemäß Art. 17 DSGVO,</li>
        <li>Recht auf Einschränkung der Verarbeitung gemäß Art. 18 DSGVO,</li>
        <li>Recht auf Datenübertragbarkeit gemäß Art. 20 DSGVO,</li>
        <li>Recht auf Widerspruch gemäß Art. 21 DSGVO.</li>
      </ul>

      <p>
        Sofern eine Verarbeitung auf Ihrer Einwilligung beruht, können Sie diese Einwilligung
        jederzeit mit Wirkung für die Zukunft widerrufen. Die Rechtmäßigkeit der bis zum Widerruf
        erfolgten Verarbeitung bleibt unberührt.
      </p>

      <p>Zur Ausübung Ihrer Rechte können Sie uns über die oben angegebene E-Mail-Adresse kontaktieren.</p>

      <h2>14. Widerspruch gegen die Verarbeitung</h2>

      <p>
        Soweit wir personenbezogene Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeiten,
        haben Sie das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit
        Widerspruch gegen diese Verarbeitung einzulegen.
      </p>

      <p>
        Nach einem Widerspruch werden wir die betroffenen personenbezogenen Daten nicht
        weiterverarbeiten, es sei denn, wir können zwingende schutzwürdige Gründe für die
        Verarbeitung nachweisen, die Ihre Interessen, Rechte und Freiheiten überwiegen, oder die
        Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen.
      </p>

      <h2>15. Beschwerderecht</h2>

      <p>
        Wenn Sie der Ansicht sind, dass die Verarbeitung Ihrer personenbezogenen Daten gegen das
        Datenschutzrecht verstößt, haben Sie das Recht, sich bei einer Datenschutzaufsichtsbehörde zu
        beschweren.
      </p>

      <p>In Österreich ist dies:</p>

      <p>
        Österreichische Datenschutzbehörde<br />
        Barichgasse 40–42<br />
        1030 Wien<br />
        Österreich<br />
        E-Mail: dsb@dsb.gv.at<br />
        Telefon: +43 1 52 152-0
      </p>

      <h2>16. Keine automatisierte Entscheidungsfindung</h2>

      <p>
        Es findet keine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne von
        Art. 22 DSGVO statt.
      </p>

      <h2>17. Änderungen dieser Datenschutzerklärung</h2>

      <p>
        Wir behalten uns vor, diese Datenschutzerklärung anzupassen, wenn sich die rechtlichen
        Anforderungen, die eingesetzten Dienste oder die Funktionen der Website ändern.
      </p>

      <p>Es gilt jeweils die auf dieser Website veröffentlichte aktuelle Fassung.</p>

      <footer class="legal-footer">
        <router-link :to="homePath">UltraPlaner</router-link>
        ·
        <router-link to="/impressum/">{{ t('legal.imprint') }}</router-link>
        ·
        <router-link to="/versorgung-ultracycling/">{{ t('legal.poisGuide') }}</router-link>
        ·
        <a href="https://codedbyalex.dev/" target="_blank" rel="noopener noreferrer">{{ t('legal.portfolio') }}</a>
      </footer>
    </article>
  </div>
</template>

<style scoped>
.legal-page {
  min-height: 100%;
  background: #f3efe6;
}

.legal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 58px;
  padding: 0.7rem 1rem;
  border-bottom: 3px solid #111;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 20;
}

.back-btn {
  border: 2px solid #111;
  background: var(--cta);
  border-radius: 0;
  padding: 0.55rem 0.85rem;
  cursor: pointer;
  font-weight: 800;
  color: #111;
  text-decoration: none;
  box-shadow: 3px 3px 0 #111;
}

.back-btn:hover {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 #111;
}

.back-btn:focus-visible {
  outline: 3px solid #111;
  outline-offset: 2px;
}

.legal-footer {
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
  font-size: 0.9rem;
  color: var(--text-muted);
}

.privacy-policy {
  max-width: 44rem;
  margin: 0 auto;
  padding: 1.75rem 1.15rem 3.5rem;
  color: var(--text);
  line-height: 1.65;
}

.privacy-policy h1 {
  margin: 0 0 0.5rem;
  font-size: 1.85rem;
  color: var(--primary-dark);
  letter-spacing: -0.02em;
}

.stand {
  margin: 0 0 1.75rem;
  color: var(--text-muted);
  font-size: 0.92rem;
}

.privacy-policy h2 {
  margin: 2rem 0 0.75rem;
  font-size: 1.2rem;
  color: var(--primary-dark);
}

.privacy-policy h3 {
  margin: 1.25rem 0 0.55rem;
  font-size: 1.02rem;
}

.privacy-policy p,
.privacy-policy ul {
  margin: 0 0 0.9rem;
  font-size: 0.95rem;
}

.privacy-policy ul {
  padding-left: 1.2rem;
}

.privacy-policy li {
  margin-bottom: 0.3rem;
}

.privacy-policy a {
  color: var(--primary);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.contact-hint {
  font-size: 0.9rem;
  color: var(--muted, #64748b);
}

@media (max-width: 640px) {
  .back-btn {
    font-size: 0.85rem;
    padding: 0.55rem 0.7rem;
  }

  .privacy-policy {
    padding: 1.25rem 1rem 2.75rem;
  }

  .privacy-policy h1 {
    font-size: 1.5rem;
  }
}
</style>
