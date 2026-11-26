import { Link } from 'react-router-dom';
import { usePageTitle } from '../components/LegalShared.js';

const STAND = '26. November 2026';

export function NutzungsbedingungenPage() {
  usePageTitle('Nutzungsbedingungen');
  return (
    <div className="page-section legal-page">
      <h1>Nutzungsbedingungen</h1>
      <p className="muted">Stand: {STAND}</p>

      <h2>1. Angebot</h2>
      <p>
        Die FMT-Methodendatenbank ist ein privates, nicht kommerzielles Angebot von Jan Schachtschabel (siehe{' '}
        <Link to="/impressum">Impressum</Link>). Sie ist kostenlos und ohne Anmeldung nutzbar: im Browser, über die
        REST-API und über den MCP-Server. Ein Anspruch auf Nutzung oder auf einen bestimmten Funktionsumfang besteht
        nicht.
      </p>

      <h2>2. Lizenzen</h2>
      <ul>
        <li>
          Methodenbeschreibungen, Daten, Vokabulare und Grafiken stehen unter{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/deed.de" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          . Bei Weitergabe nenne bitte „Jan Schachtschabel, Facettierte Methodentaxonomie (FMT), CC BY 4.0“.
        </li>
        <li>Der Quellcode steht unter der Apache-Lizenz 2.0.</li>
        <li>
          Materialien aus WirLernenOnline und andere verlinkte Inhalte gehören ihren Urheberinnen und Urhebern und
          stehen unter deren eigenen Lizenzen. Prüfe die Lizenz, bevor du sie verwendest.
        </li>
      </ul>

      <h2>3. Inhalte und KI-Ergebnisse</h2>
      <p>
        Die Datenbank ist sorgfältig erstellt, ersetzt aber nicht das eigene fachliche und pädagogische Urteil.
        Vorschläge zu Abläufen, Differenzierung und Methoden sind Anregungen. Texte aus KI-gestützten Funktionen (z. B. Ausformulieren,
        Material erstellen, Übersetzen), können Fehler enthalten. Prüfe sie vor dem Einsatz im Unterricht und kennzeichne sie bei der
        Weitergabe als KI-unterstützt.
      </p>

      <h2>4. Was du bitte beachtest</h2>
      <ul>
        <li>
          Gib keine personenbezogenen Daten von Schülerinnen, Schülern oder anderen Personen ein (z. B. Namen,
          Diagnosen, Noten). Allgemeine Angaben wie „5 Kinder mit DaZ“ genügen.
        </li>
        <li>
          Nutze API und MCP-Server in einem fairen Umfang. Es gelten Anfragegrenzen je IP-Adresse. Automatisierte
          Massenabrufe, die den Betrieb stören, sind nicht erlaubt; der Zugang kann dann eingeschränkt werden. Der
          komplette Katalog steht als Download (JSON-LD) bereit.
        </li>
        <li>Versuche nicht, Schutzmechanismen zu umgehen oder den Dienst anzugreifen.</li>
        <li>
          Wenn du eine eigene KI einträgst, gelten die Bedingungen und Kosten des von dir gewählten Anbieters. Du bist
          für deinen Schlüssel selbst verantwortlich.
        </li>
      </ul>

      <h2>5. Verfügbarkeit</h2>
      <p>
        Das Angebot wird ohne Gewähr für ständige Verfügbarkeit betrieben. Es kann jederzeit geändert, unterbrochen
        oder eingestellt werden. Im Browser gespeicherte Szenarien solltest du bei Bedarf exportieren.
      </p>

      <h2>6. Haftung</h2>
      <p>
        Für Schäden aus der Nutzung haftet der Anbieter unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei
        Verletzung von Leben, Körper oder Gesundheit. Im Übrigen ist die Haftung ausgeschlossen, soweit das gesetzlich
        zulässig ist. Für Inhalte verlinkter fremder Seiten sind deren Betreiber verantwortlich.
      </p>

      <h2>7. Änderungen und Recht</h2>
      <p>
        Diese Bedingungen können angepasst werden; es gilt die jeweils hier veröffentlichte Fassung. Es gilt deutsches
        Recht. Hinweise zum Umgang mit Daten stehen in der <Link to="/datenschutz">Datenschutzerklärung</Link>.
      </p>
    </div>
  );
}
