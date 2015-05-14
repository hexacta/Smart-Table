(function (ng, undefined){
    'use strict';

ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
    $templateCache.put('template/smart-table/pagination.html',
        '<nav ng-if="pages.length >= 2"><ul class="pagination">' +
        '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
        '</ul></nav>');
}]);


ng.module('smart-table')
  .constant('stConfig', {
    pagination: {
      template: 'template/smart-table/pagination.html',
      itemsByPage: 10,
      displayedPages: 5
    },
    search: {
      delay: 400 // ms
    },
    select: {
      mode: 'single',
      selectedClass: 'st-selected'
    },
    sort: {
      ascentClass: 'st-sort-ascent',
      descentClass: 'st-sort-descent',
      skipNatural: false
    },
    pipe: {
      delay: 100 //ms
    },
    searchType: {
      server: true
    }
  });
ng.module('smart-table')
  .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', 'stConfig', function StTableController ($scope, $parse, $filter, $attrs, stConfig) {
    var propertyName = $attrs.stTable;
    var displayGetter = $parse(propertyName);
    var displaySetter = displayGetter.assign;
    var safeGetter;
    var orderBy = $filter('orderBy');
    var filter = $filter('filter');
    var safeCopy = copyRefs(displayGetter($scope));
    var tableState = {
      sort: {},
      search: {},
      pagination: {
        start: 0
      },
      columns: []
    };
    var filtered;
    var pipeAfterSafeCopy = true;
    var ctrl = this;
    var lastSelected;

    function copyRefs (src) {
      return src ? [].concat(src) : [];
    }

    function updateSafeCopy () {
      safeCopy = copyRefs(safeGetter($scope));
      if (pipeAfterSafeCopy === true) {
        ctrl.pipe();
      }
    }

    if ($attrs.stSafeSrc) {
      safeGetter = $parse($attrs.stSafeSrc);
      $scope.$watch(function () {
        var safeSrc = safeGetter($scope);
        return safeSrc ? safeSrc.length : 0;

      }, function (newValue, oldValue) {
        if (newValue !== safeCopy.length) {
          updateSafeCopy();
        }
      });
      $scope.$watch(function () {
        return safeGetter($scope);
      }, function (newValue, oldValue) {
        if (newValue !== oldValue) {
          updateSafeCopy();
        }
      });
    }

    /**
     * sort the rows
     * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
     * @param [reverse] - if you want to reverse the order
     */
    this.sortBy = function sortBy (predicate, reverse) {
      tableState.sort.predicate = predicate;
      tableState.sort.reverse = reverse === true;

      if (ng.isFunction(predicate)) {
        tableState.sort.functionName = predicate.name;
      } else {
        delete tableState.sort.functionName;
      }

      tableState.pagination.start = 0;
      return this.pipe();
    };

    /**
     * search matching rows
     * @param {String} input - the input string
     * @param {String} [predicate] - the property name against you want to check the match, otherwise it will search on all properties
     */
    this.search = function search (input, predicate) {
      var predicateObject = tableState.search.predicateObject || {};
      var prop = predicate ? predicate : '$';

      input = ng.isString(input) ? input.trim() : input;
      predicateObject[prop] = input;
      // to avoid to filter out null value
      if (!input) {
        delete predicateObject[prop];
      }
      tableState.search.predicateObject = predicateObject;
      tableState.pagination.start = 0;
      return this.pipe();
    };

    /**
     * this will chain the operations of sorting and filtering based on the current table state (sort options, filtering, ect)
     */
    this.pipe = function pipe () {
      if(stConfig.searchType.server) {
        this.serverSearch();
      }
      else {
        this.localSearch();
      }
    };

    this.serverSearch = function serverSearch() {
      var self = this;
      var pagination = tableState.pagination;
      var config = {
        params: {
          orderBy: tableState.sort.predicate,
          reverse: tableState.sort.reverse,
          filter: tableState.search.predicateObject? tableState.search.predicateObject.$ : undefined,
          offset: pagination.start,
          pageSize: pagination.number,
          columns: tableState.columns
        }
      };

      $scope[$attrs.stSearchFn](config).success(function (res) {
        filtered = res[0].collection;
        var output = self.paginate(pagination, res[0].length);
        displaySetter($scope, output || filtered);
      });

    };

    this.localSearch = function localSearch() {
      var self = this;
      var pagination = tableState.pagination;
      filtered = tableState.search.predicateObject ? filter(safeCopy, tableState.search.predicateObject) : safeCopy;
        if (tableState.sort.predicate) {
          filtered = orderBy(filtered, tableState.sort.predicate, tableState.sort.reverse);
        }
        var output = self.paginate(pagination, filtered.length);
        displaySetter($scope, output || filtered);
    };

    this.paginate = function paginate (pagination, collectionLength) {
      if (pagination.number !== undefined) {
        pagination.numberOfPages = collectionLength > 0 ? Math.ceil(collectionLength / pagination.number) : 1;
        pagination.start = pagination.start >= collectionLength ? (pagination.numberOfPages - 1) * pagination.number : pagination.start;
        return filtered.slice(pagination.start, pagination.start + parseInt(pagination.number));
      }
      else {
        return [];
      }
    };

    /**
     * select a dataRow (it will add the attribute isSelected to the row object)
     * @param {Object} row - the row to select
     * @param {String} [mode] - "single" or "multiple" (multiple by default)
     */
    this.select = function select (row, mode) {
      var rows = copyRefs(displayGetter($scope));
      var index = rows.indexOf(row);
      if (index !== -1) {
        if (mode === 'single') {
          row.isSelected = row.isSelected !== true;
          if (lastSelected) {
            lastSelected.isSelected = false;
          }
          lastSelected = row.isSelected === true ? row : undefined;
        } else {
          rows[index].isSelected = !rows[index].isSelected;
        }
      }
    };

    /**
     * take a slice of the current sorted/filtered collection (pagination)
     *
     * @param {Number} start - start index of the slice
     * @param {Number} number - the number of item in the slice
     */
    this.slice = function splice (start, number) {
      tableState.pagination.start = start;
      tableState.pagination.number = number;
      return this.pipe();
    };

    /**
     * return the current state of the table
     * @returns {{sort: {}, search: {}, pagination: {start: number}}}
     */
    this.tableState = function getTableState () {
      return tableState;
    };

    this.getFilteredCollection = function getFilteredCollection () {
      return filtered || safeCopy;
    };

    /**
     * Use a different filter function than the angular FilterFilter
     * @param filterName the name under which the custom filter is registered
     */
    this.setFilterFunction = function setFilterFunction (filterName) {
      filter = $filter(filterName);
    };

    /**
     * Use a different function than the angular orderBy
     * @param sortFunctionName the name under which the custom order function is registered
     */
    this.setSortFunction = function setSortFunction (sortFunctionName) {
      orderBy = $filter(sortFunctionName);
    };

    /**
     * Usually when the safe copy is updated the pipe function is called.
     * Calling this method will prevent it, which is something required when using a custom pipe function
     */
    this.preventPipeOnWatch = function preventPipe () {
      pipeAfterSafeCopy = false;
    };
  }])
  .directive('stTable', function () {
    return {
      restrict: 'A',
      controller: 'stTableController',
      link: function (scope, element, attr, ctrl) {

        if (attr.stSetFilter) {
          ctrl.setFilterFunction(attr.stSetFilter);
        }

        if (attr.stSetSort) {
          ctrl.setSortFunction(attr.stSetSort);
        }
      }
    };
  });

ng.module('smart-table')
  .directive('stSearch', ['stConfig', '$timeout', function (stConfig, $timeout) {
    return {
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {
        var tableCtrl = ctrl;
        var promise = null;
        var throttle = attr.stDelay || stConfig.search.delay;

        attr.$observe('stSearch', function (newValue, oldValue) {
          var input = element[0].value;
          if (newValue !== oldValue && input) {
            ctrl.tableState().search = {};
            tableCtrl.search(input, newValue);
          }
        });

        //table state -> view
        scope.$watch(function () {
          return ctrl.tableState().search;
        }, function (newValue, oldValue) {
          var predicateExpression = attr.stSearch || '$';
          if (newValue.predicateObject && newValue.predicateObject[predicateExpression] !== element[0].value) {
            element[0].value = newValue.predicateObject[predicateExpression] || '';
          }
        }, true);

        // view -> table state
        element.bind('input', function (evt) {
          evt = evt.originalEvent || evt;
          if (promise !== null) {
            $timeout.cancel(promise);
          }

          promise = $timeout(function () {
            tableCtrl.search(evt.target.value, attr.stSearch || '');
            promise = null;
          }, throttle);
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSelectRow', ['stConfig', function (stConfig) {
    return {
      restrict: 'A',
      require: '^stTable',
      scope: {
        row: '=stSelectRow'
      },
      link: function (scope, element, attr, ctrl) {
        var mode = attr.stSelectMode || stConfig.select.mode;
        element.bind('click', function () {
          scope.$apply(function () {
            ctrl.select(scope.row, mode);
          });
        });

        scope.$watch('row.isSelected', function (newValue) {
          if (newValue === true) {
            element.addClass(stConfig.select.selectedClass);
          } else {
            element.removeClass(stConfig.select.selectedClass);
          }
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSort', ['stConfig', '$parse', function (stConfig, $parse) {
    return {
      restrict: 'A',
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {

        var predicate = attr.stSort;
        var getter = $parse(predicate);
        var index = 0;
        var classAscent = attr.stClassAscent || stConfig.sort.ascentClass;
        var classDescent = attr.stClassDescent || stConfig.sort.descentClass;
        var stateClasses = [classAscent, classDescent];
        var sortDefault;
        var skipNatural = attr.stSkipNatural !== undefined ? attr.stSkipNatural : stConfig.skipNatural;

        if (attr.stSortDefault) {
          sortDefault = scope.$eval(attr.stSortDefault) !== undefined ? scope.$eval(attr.stSortDefault) : attr.stSortDefault;
        }

        ctrl.tableState().columns.push(predicate);

        //view --> table state
        function sort () {
          index++;
          predicate = ng.isFunction(getter(scope)) ? getter(scope) : attr.stSort;
          if (index % 3 === 0 && !!skipNatural !== true) {
            //manual reset
            index = 0;
            ctrl.tableState().sort = {};
            ctrl.tableState().pagination.start = 0;
            ctrl.pipe();
          } else {
            ctrl.sortBy(predicate, index % 2 === 0);
          }
        }

        element.bind('click', function sortClick () {
          if (predicate) {
            scope.$apply(sort);
          }
        });

        if (sortDefault) {
          index = sortDefault === 'reverse' ? 1 : 0;
          sort();
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().sort;
        }, function (newValue) {
          if (newValue.predicate !== predicate) {
            index = 0;
            element
              .removeClass(classAscent)
              .removeClass(classDescent);
          } else {
            index = newValue.reverse === true ? 2 : 1;
            element
              .removeClass(stateClasses[index % 2])
              .addClass(stateClasses[index - 1]);
          }
        }, true);
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPagination', ['stConfig', function (stConfig) {
    return {
      restrict: 'EA',
      require: '^stTable',
      scope: {
        stItemsByPage: '=?',
        stDisplayedPages: '=?',
        stPageChange: '&'
      },
      templateUrl: function (element, attrs) {
        if (attrs.stTemplate) {
          return attrs.stTemplate;
        }
        return stConfig.pagination.template;
      },
      link: function (scope, element, attrs, ctrl) {

        scope.stItemsByPage = scope.stItemsByPage ? +(scope.stItemsByPage) : stConfig.pagination.itemsByPage;
        scope.stDisplayedPages = scope.stDisplayedPages ? +(scope.stDisplayedPages) : stConfig.pagination.displayedPages;

        scope.currentPage = 1;
        scope.pages = [];

        function redraw () {
          var paginationState = ctrl.tableState().pagination;
          var start = 1;
          var end;
          var i;
          var prevPage = scope.currentPage;
          scope.currentPage = Math.floor(paginationState.start / paginationState.number) + 1;

          start = Math.max(start, scope.currentPage - Math.abs(Math.floor(scope.stDisplayedPages / 2)));
          end = start + scope.stDisplayedPages;

          if (end > paginationState.numberOfPages) {
            end = paginationState.numberOfPages + 1;
            start = Math.max(1, end - scope.stDisplayedPages);
          }

          scope.pages = [];
          scope.numPages = paginationState.numberOfPages;

          for (i = start; i < end; i++) {
            scope.pages.push(i);
          }

          if (prevPage !== scope.currentPage) {
            scope.stPageChange({newPage: scope.currentPage});
          }
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().pagination;
        }, redraw, true);

        //scope --> table state  (--> view)
        scope.$watch('stItemsByPage', function (newValue, oldValue) {
          if (newValue !== oldValue) {
            scope.selectPage(1);
          }
        });

        scope.$watch('stDisplayedPages', redraw);

        //view -> table state
        scope.selectPage = function (page) {
          if (page > 0 && page <= scope.numPages) {
            ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
          }
        };

        if (!ctrl.tableState().pagination.number) {
          ctrl.slice(0, scope.stItemsByPage);
        }
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPipe', ['stConfig', '$timeout', function (config, $timeout) {
    return {
      require: 'stTable',
      scope: {
        stPipe: '='
      },
      link: {

        pre: function (scope, element, attrs, ctrl) {

          var pipePromise = null;

          if (ng.isFunction(scope.stPipe)) {
            ctrl.preventPipeOnWatch();
            ctrl.pipe = function () {

              if (pipePromise !== null) {
                $timeout.cancel(pipePromise)
              }

              pipePromise = $timeout(function () {
                scope.stPipe(ctrl.tableState(), ctrl);
              }, config.pipe.delay);

              return pipePromise;
            }
          }
        },

        post: function (scope, element, attrs, ctrl) {
          ctrl.pipe();
        }
      }
    };
  }]);

})(angular);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90b3AudHh0Iiwic3JjL3NtYXJ0LXRhYmxlLm1vZHVsZS5qcyIsInNyYy9zdENvbmZpZy5qcyIsInNyYy9zdFRhYmxlLmpzIiwic3JjL3N0U2VhcmNoLmpzIiwic3JjL3N0U2VsZWN0Um93LmpzIiwic3JjL3N0U29ydC5qcyIsInNyYy9zdFBhZ2luYXRpb24uanMiLCJzcmMvc3RQaXBlLmpzIiwic3JjL2JvdHRvbS50eHQiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FDRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDek9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwQ0EiLCJmaWxlIjoic21hcnQtdGFibGUuanMiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gKG5nLCB1bmRlZmluZWQpe1xuICAgICd1c2Ugc3RyaWN0JztcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnLCBbXSkucnVuKFsnJHRlbXBsYXRlQ2FjaGUnLCBmdW5jdGlvbiAoJHRlbXBsYXRlQ2FjaGUpIHtcbiAgICAkdGVtcGxhdGVDYWNoZS5wdXQoJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCcsXG4gICAgICAgICc8bmF2IG5nLWlmPVwicGFnZXMubGVuZ3RoID49IDJcIj48dWwgY2xhc3M9XCJwYWdpbmF0aW9uXCI+JyArXG4gICAgICAgICc8bGkgbmctcmVwZWF0PVwicGFnZSBpbiBwYWdlc1wiIG5nLWNsYXNzPVwie2FjdGl2ZTogcGFnZT09Y3VycmVudFBhZ2V9XCI+PGEgbmctY2xpY2s9XCJzZWxlY3RQYWdlKHBhZ2UpXCI+e3twYWdlfX08L2E+PC9saT4nICtcbiAgICAgICAgJzwvdWw+PC9uYXY+Jyk7XG59XSk7XG5cbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxuICAuY29uc3RhbnQoJ3N0Q29uZmlnJywge1xuICAgIHBhZ2luYXRpb246IHtcbiAgICAgIHRlbXBsYXRlOiAndGVtcGxhdGUvc21hcnQtdGFibGUvcGFnaW5hdGlvbi5odG1sJyxcbiAgICAgIGl0ZW1zQnlQYWdlOiAxMCxcbiAgICAgIGRpc3BsYXllZFBhZ2VzOiA1XG4gICAgfSxcbiAgICBzZWFyY2g6IHtcbiAgICAgIGRlbGF5OiA0MDAgLy8gbXNcbiAgICB9LFxuICAgIHNlbGVjdDoge1xuICAgICAgbW9kZTogJ3NpbmdsZScsXG4gICAgICBzZWxlY3RlZENsYXNzOiAnc3Qtc2VsZWN0ZWQnXG4gICAgfSxcbiAgICBzb3J0OiB7XG4gICAgICBhc2NlbnRDbGFzczogJ3N0LXNvcnQtYXNjZW50JyxcbiAgICAgIGRlc2NlbnRDbGFzczogJ3N0LXNvcnQtZGVzY2VudCcsXG4gICAgICBza2lwTmF0dXJhbDogZmFsc2VcbiAgICB9LFxuICAgIHBpcGU6IHtcbiAgICAgIGRlbGF5OiAxMDAgLy9tc1xuICAgIH0sXG4gICAgc2VhcmNoVHlwZToge1xuICAgICAgc2VydmVyOiB0cnVlXG4gICAgfVxuICB9KTsiLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmNvbnRyb2xsZXIoJ3N0VGFibGVDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHBhcnNlJywgJyRmaWx0ZXInLCAnJGF0dHJzJywgJ3N0Q29uZmlnJywgZnVuY3Rpb24gU3RUYWJsZUNvbnRyb2xsZXIgKCRzY29wZSwgJHBhcnNlLCAkZmlsdGVyLCAkYXR0cnMsIHN0Q29uZmlnKSB7XG4gICAgdmFyIHByb3BlcnR5TmFtZSA9ICRhdHRycy5zdFRhYmxlO1xuICAgIHZhciBkaXNwbGF5R2V0dGVyID0gJHBhcnNlKHByb3BlcnR5TmFtZSk7XG4gICAgdmFyIGRpc3BsYXlTZXR0ZXIgPSBkaXNwbGF5R2V0dGVyLmFzc2lnbjtcbiAgICB2YXIgc2FmZUdldHRlcjtcbiAgICB2YXIgb3JkZXJCeSA9ICRmaWx0ZXIoJ29yZGVyQnknKTtcbiAgICB2YXIgZmlsdGVyID0gJGZpbHRlcignZmlsdGVyJyk7XG4gICAgdmFyIHNhZmVDb3B5ID0gY29weVJlZnMoZGlzcGxheUdldHRlcigkc2NvcGUpKTtcbiAgICB2YXIgdGFibGVTdGF0ZSA9IHtcbiAgICAgIHNvcnQ6IHt9LFxuICAgICAgc2VhcmNoOiB7fSxcbiAgICAgIHBhZ2luYXRpb246IHtcbiAgICAgICAgc3RhcnQ6IDBcbiAgICAgIH0sXG4gICAgICBjb2x1bW5zOiBbXVxuICAgIH07XG4gICAgdmFyIGZpbHRlcmVkO1xuICAgIHZhciBwaXBlQWZ0ZXJTYWZlQ29weSA9IHRydWU7XG4gICAgdmFyIGN0cmwgPSB0aGlzO1xuICAgIHZhciBsYXN0U2VsZWN0ZWQ7XG5cbiAgICBmdW5jdGlvbiBjb3B5UmVmcyAoc3JjKSB7XG4gICAgICByZXR1cm4gc3JjID8gW10uY29uY2F0KHNyYykgOiBbXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB1cGRhdGVTYWZlQ29weSAoKSB7XG4gICAgICBzYWZlQ29weSA9IGNvcHlSZWZzKHNhZmVHZXR0ZXIoJHNjb3BlKSk7XG4gICAgICBpZiAocGlwZUFmdGVyU2FmZUNvcHkgPT09IHRydWUpIHtcbiAgICAgICAgY3RybC5waXBlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCRhdHRycy5zdFNhZmVTcmMpIHtcbiAgICAgIHNhZmVHZXR0ZXIgPSAkcGFyc2UoJGF0dHJzLnN0U2FmZVNyYyk7XG4gICAgICAkc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHNhZmVTcmMgPSBzYWZlR2V0dGVyKCRzY29wZSk7XG4gICAgICAgIHJldHVybiBzYWZlU3JjID8gc2FmZVNyYy5sZW5ndGggOiAwO1xuXG4gICAgICB9LCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XG4gICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gc2FmZUNvcHkubGVuZ3RoKSB7XG4gICAgICAgICAgdXBkYXRlU2FmZUNvcHkoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAkc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHNhZmVHZXR0ZXIoJHNjb3BlKTtcbiAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcbiAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSkge1xuICAgICAgICAgIHVwZGF0ZVNhZmVDb3B5KCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHNvcnQgdGhlIHJvd3NcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9uIHwgU3RyaW5nfSBwcmVkaWNhdGUgLSBmdW5jdGlvbiBvciBzdHJpbmcgd2hpY2ggd2lsbCBiZSB1c2VkIGFzIHByZWRpY2F0ZSBmb3IgdGhlIHNvcnRpbmdcbiAgICAgKiBAcGFyYW0gW3JldmVyc2VdIC0gaWYgeW91IHdhbnQgdG8gcmV2ZXJzZSB0aGUgb3JkZXJcbiAgICAgKi9cbiAgICB0aGlzLnNvcnRCeSA9IGZ1bmN0aW9uIHNvcnRCeSAocHJlZGljYXRlLCByZXZlcnNlKSB7XG4gICAgICB0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlID0gcHJlZGljYXRlO1xuICAgICAgdGFibGVTdGF0ZS5zb3J0LnJldmVyc2UgPSByZXZlcnNlID09PSB0cnVlO1xuXG4gICAgICBpZiAobmcuaXNGdW5jdGlvbihwcmVkaWNhdGUpKSB7XG4gICAgICAgIHRhYmxlU3RhdGUuc29ydC5mdW5jdGlvbk5hbWUgPSBwcmVkaWNhdGUubmFtZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbGV0ZSB0YWJsZVN0YXRlLnNvcnQuZnVuY3Rpb25OYW1lO1xuICAgICAgfVxuXG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xuICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBzZWFyY2ggbWF0Y2hpbmcgcm93c1xuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCAtIHRoZSBpbnB1dCBzdHJpbmdcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gW3ByZWRpY2F0ZV0gLSB0aGUgcHJvcGVydHkgbmFtZSBhZ2FpbnN0IHlvdSB3YW50IHRvIGNoZWNrIHRoZSBtYXRjaCwgb3RoZXJ3aXNlIGl0IHdpbGwgc2VhcmNoIG9uIGFsbCBwcm9wZXJ0aWVzXG4gICAgICovXG4gICAgdGhpcy5zZWFyY2ggPSBmdW5jdGlvbiBzZWFyY2ggKGlucHV0LCBwcmVkaWNhdGUpIHtcbiAgICAgIHZhciBwcmVkaWNhdGVPYmplY3QgPSB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgfHwge307XG4gICAgICB2YXIgcHJvcCA9IHByZWRpY2F0ZSA/IHByZWRpY2F0ZSA6ICckJztcblxuICAgICAgaW5wdXQgPSBuZy5pc1N0cmluZyhpbnB1dCkgPyBpbnB1dC50cmltKCkgOiBpbnB1dDtcbiAgICAgIHByZWRpY2F0ZU9iamVjdFtwcm9wXSA9IGlucHV0O1xuICAgICAgLy8gdG8gYXZvaWQgdG8gZmlsdGVyIG91dCBudWxsIHZhbHVlXG4gICAgICBpZiAoIWlucHV0KSB7XG4gICAgICAgIGRlbGV0ZSBwcmVkaWNhdGVPYmplY3RbcHJvcF07XG4gICAgICB9XG4gICAgICB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSBwcmVkaWNhdGVPYmplY3Q7XG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xuICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiB0aGlzIHdpbGwgY2hhaW4gdGhlIG9wZXJhdGlvbnMgb2Ygc29ydGluZyBhbmQgZmlsdGVyaW5nIGJhc2VkIG9uIHRoZSBjdXJyZW50IHRhYmxlIHN0YXRlIChzb3J0IG9wdGlvbnMsIGZpbHRlcmluZywgZWN0KVxuICAgICAqL1xuICAgIHRoaXMucGlwZSA9IGZ1bmN0aW9uIHBpcGUgKCkge1xuICAgICAgaWYoc3RDb25maWcuc2VhcmNoVHlwZS5zZXJ2ZXIpIHtcbiAgICAgICAgdGhpcy5zZXJ2ZXJTZWFyY2goKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICB0aGlzLmxvY2FsU2VhcmNoKCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRoaXMuc2VydmVyU2VhcmNoID0gZnVuY3Rpb24gc2VydmVyU2VhcmNoKCkge1xuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XG4gICAgICB2YXIgY29uZmlnID0ge1xuICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICBvcmRlckJ5OiB0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlLFxuICAgICAgICAgIHJldmVyc2U6IHRhYmxlU3RhdGUuc29ydC5yZXZlcnNlLFxuICAgICAgICAgIGZpbHRlcjogdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0PyB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QuJCA6IHVuZGVmaW5lZCxcbiAgICAgICAgICBvZmZzZXQ6IHBhZ2luYXRpb24uc3RhcnQsXG4gICAgICAgICAgcGFnZVNpemU6IHBhZ2luYXRpb24ubnVtYmVyLFxuICAgICAgICAgIGNvbHVtbnM6IHRhYmxlU3RhdGUuY29sdW1uc1xuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAkc2NvcGVbJGF0dHJzLnN0U2VhcmNoRm5dKGNvbmZpZykuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG4gICAgICAgIGZpbHRlcmVkID0gcmVzWzBdLmNvbGxlY3Rpb247XG4gICAgICAgIHZhciBvdXRwdXQgPSBzZWxmLnBhZ2luYXRlKHBhZ2luYXRpb24sIHJlc1swXS5sZW5ndGgpO1xuICAgICAgICBkaXNwbGF5U2V0dGVyKCRzY29wZSwgb3V0cHV0IHx8IGZpbHRlcmVkKTtcbiAgICAgIH0pO1xuXG4gICAgfTtcblxuICAgIHRoaXMubG9jYWxTZWFyY2ggPSBmdW5jdGlvbiBsb2NhbFNlYXJjaCgpIHtcbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHZhciBwYWdpbmF0aW9uID0gdGFibGVTdGF0ZS5wYWdpbmF0aW9uO1xuICAgICAgZmlsdGVyZWQgPSB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPyBmaWx0ZXIoc2FmZUNvcHksIHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdCkgOiBzYWZlQ29weTtcbiAgICAgICAgaWYgKHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUpIHtcbiAgICAgICAgICBmaWx0ZXJlZCA9IG9yZGVyQnkoZmlsdGVyZWQsIHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUsIHRhYmxlU3RhdGUuc29ydC5yZXZlcnNlKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgb3V0cHV0ID0gc2VsZi5wYWdpbmF0ZShwYWdpbmF0aW9uLCBmaWx0ZXJlZC5sZW5ndGgpO1xuICAgICAgICBkaXNwbGF5U2V0dGVyKCRzY29wZSwgb3V0cHV0IHx8IGZpbHRlcmVkKTtcbiAgICB9O1xuXG4gICAgdGhpcy5wYWdpbmF0ZSA9IGZ1bmN0aW9uIHBhZ2luYXRlIChwYWdpbmF0aW9uLCBjb2xsZWN0aW9uTGVuZ3RoKSB7XG4gICAgICBpZiAocGFnaW5hdGlvbi5udW1iZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBwYWdpbmF0aW9uLm51bWJlck9mUGFnZXMgPSBjb2xsZWN0aW9uTGVuZ3RoID4gMCA/IE1hdGguY2VpbChjb2xsZWN0aW9uTGVuZ3RoIC8gcGFnaW5hdGlvbi5udW1iZXIpIDogMTtcbiAgICAgICAgcGFnaW5hdGlvbi5zdGFydCA9IHBhZ2luYXRpb24uc3RhcnQgPj0gY29sbGVjdGlvbkxlbmd0aCA/IChwYWdpbmF0aW9uLm51bWJlck9mUGFnZXMgLSAxKSAqIHBhZ2luYXRpb24ubnVtYmVyIDogcGFnaW5hdGlvbi5zdGFydDtcbiAgICAgICAgcmV0dXJuIGZpbHRlcmVkLnNsaWNlKHBhZ2luYXRpb24uc3RhcnQsIHBhZ2luYXRpb24uc3RhcnQgKyBwYXJzZUludChwYWdpbmF0aW9uLm51bWJlcikpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogc2VsZWN0IGEgZGF0YVJvdyAoaXQgd2lsbCBhZGQgdGhlIGF0dHJpYnV0ZSBpc1NlbGVjdGVkIHRvIHRoZSByb3cgb2JqZWN0KVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByb3cgLSB0aGUgcm93IHRvIHNlbGVjdFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbbW9kZV0gLSBcInNpbmdsZVwiIG9yIFwibXVsdGlwbGVcIiAobXVsdGlwbGUgYnkgZGVmYXVsdClcbiAgICAgKi9cbiAgICB0aGlzLnNlbGVjdCA9IGZ1bmN0aW9uIHNlbGVjdCAocm93LCBtb2RlKSB7XG4gICAgICB2YXIgcm93cyA9IGNvcHlSZWZzKGRpc3BsYXlHZXR0ZXIoJHNjb3BlKSk7XG4gICAgICB2YXIgaW5kZXggPSByb3dzLmluZGV4T2Yocm93KTtcbiAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgaWYgKG1vZGUgPT09ICdzaW5nbGUnKSB7XG4gICAgICAgICAgcm93LmlzU2VsZWN0ZWQgPSByb3cuaXNTZWxlY3RlZCAhPT0gdHJ1ZTtcbiAgICAgICAgICBpZiAobGFzdFNlbGVjdGVkKSB7XG4gICAgICAgICAgICBsYXN0U2VsZWN0ZWQuaXNTZWxlY3RlZCA9IGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBsYXN0U2VsZWN0ZWQgPSByb3cuaXNTZWxlY3RlZCA9PT0gdHJ1ZSA/IHJvdyA6IHVuZGVmaW5lZDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByb3dzW2luZGV4XS5pc1NlbGVjdGVkID0gIXJvd3NbaW5kZXhdLmlzU2VsZWN0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogdGFrZSBhIHNsaWNlIG9mIHRoZSBjdXJyZW50IHNvcnRlZC9maWx0ZXJlZCBjb2xsZWN0aW9uIChwYWdpbmF0aW9uKVxuICAgICAqXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0IC0gc3RhcnQgaW5kZXggb2YgdGhlIHNsaWNlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG51bWJlciAtIHRoZSBudW1iZXIgb2YgaXRlbSBpbiB0aGUgc2xpY2VcbiAgICAgKi9cbiAgICB0aGlzLnNsaWNlID0gZnVuY3Rpb24gc3BsaWNlIChzdGFydCwgbnVtYmVyKSB7XG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSBzdGFydDtcbiAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5udW1iZXIgPSBudW1iZXI7XG4gICAgICByZXR1cm4gdGhpcy5waXBlKCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIHJldHVybiB0aGUgY3VycmVudCBzdGF0ZSBvZiB0aGUgdGFibGVcbiAgICAgKiBAcmV0dXJucyB7e3NvcnQ6IHt9LCBzZWFyY2g6IHt9LCBwYWdpbmF0aW9uOiB7c3RhcnQ6IG51bWJlcn19fVxuICAgICAqL1xuICAgIHRoaXMudGFibGVTdGF0ZSA9IGZ1bmN0aW9uIGdldFRhYmxlU3RhdGUgKCkge1xuICAgICAgcmV0dXJuIHRhYmxlU3RhdGU7XG4gICAgfTtcblxuICAgIHRoaXMuZ2V0RmlsdGVyZWRDb2xsZWN0aW9uID0gZnVuY3Rpb24gZ2V0RmlsdGVyZWRDb2xsZWN0aW9uICgpIHtcbiAgICAgIHJldHVybiBmaWx0ZXJlZCB8fCBzYWZlQ29weTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogVXNlIGEgZGlmZmVyZW50IGZpbHRlciBmdW5jdGlvbiB0aGFuIHRoZSBhbmd1bGFyIEZpbHRlckZpbHRlclxuICAgICAqIEBwYXJhbSBmaWx0ZXJOYW1lIHRoZSBuYW1lIHVuZGVyIHdoaWNoIHRoZSBjdXN0b20gZmlsdGVyIGlzIHJlZ2lzdGVyZWRcbiAgICAgKi9cbiAgICB0aGlzLnNldEZpbHRlckZ1bmN0aW9uID0gZnVuY3Rpb24gc2V0RmlsdGVyRnVuY3Rpb24gKGZpbHRlck5hbWUpIHtcbiAgICAgIGZpbHRlciA9ICRmaWx0ZXIoZmlsdGVyTmFtZSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFVzZSBhIGRpZmZlcmVudCBmdW5jdGlvbiB0aGFuIHRoZSBhbmd1bGFyIG9yZGVyQnlcbiAgICAgKiBAcGFyYW0gc29ydEZ1bmN0aW9uTmFtZSB0aGUgbmFtZSB1bmRlciB3aGljaCB0aGUgY3VzdG9tIG9yZGVyIGZ1bmN0aW9uIGlzIHJlZ2lzdGVyZWRcbiAgICAgKi9cbiAgICB0aGlzLnNldFNvcnRGdW5jdGlvbiA9IGZ1bmN0aW9uIHNldFNvcnRGdW5jdGlvbiAoc29ydEZ1bmN0aW9uTmFtZSkge1xuICAgICAgb3JkZXJCeSA9ICRmaWx0ZXIoc29ydEZ1bmN0aW9uTmFtZSk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFVzdWFsbHkgd2hlbiB0aGUgc2FmZSBjb3B5IGlzIHVwZGF0ZWQgdGhlIHBpcGUgZnVuY3Rpb24gaXMgY2FsbGVkLlxuICAgICAqIENhbGxpbmcgdGhpcyBtZXRob2Qgd2lsbCBwcmV2ZW50IGl0LCB3aGljaCBpcyBzb21ldGhpbmcgcmVxdWlyZWQgd2hlbiB1c2luZyBhIGN1c3RvbSBwaXBlIGZ1bmN0aW9uXG4gICAgICovXG4gICAgdGhpcy5wcmV2ZW50UGlwZU9uV2F0Y2ggPSBmdW5jdGlvbiBwcmV2ZW50UGlwZSAoKSB7XG4gICAgICBwaXBlQWZ0ZXJTYWZlQ29weSA9IGZhbHNlO1xuICAgIH07XG4gIH1dKVxuICAuZGlyZWN0aXZlKCdzdFRhYmxlJywgZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgY29udHJvbGxlcjogJ3N0VGFibGVDb250cm9sbGVyJyxcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xuXG4gICAgICAgIGlmIChhdHRyLnN0U2V0RmlsdGVyKSB7XG4gICAgICAgICAgY3RybC5zZXRGaWx0ZXJGdW5jdGlvbihhdHRyLnN0U2V0RmlsdGVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhdHRyLnN0U2V0U29ydCkge1xuICAgICAgICAgIGN0cmwuc2V0U29ydEZ1bmN0aW9uKGF0dHIuc3RTZXRTb3J0KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gIH0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0U2VhcmNoJywgWydzdENvbmZpZycsICckdGltZW91dCcsIGZ1bmN0aW9uIChzdENvbmZpZywgJHRpbWVvdXQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xuICAgICAgICB2YXIgdGFibGVDdHJsID0gY3RybDtcbiAgICAgICAgdmFyIHByb21pc2UgPSBudWxsO1xuICAgICAgICB2YXIgdGhyb3R0bGUgPSBhdHRyLnN0RGVsYXkgfHwgc3RDb25maWcuc2VhcmNoLmRlbGF5O1xuXG4gICAgICAgIGF0dHIuJG9ic2VydmUoJ3N0U2VhcmNoJywgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xuICAgICAgICAgIHZhciBpbnB1dCA9IGVsZW1lbnRbMF0udmFsdWU7XG4gICAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSAmJiBpbnB1dCkge1xuICAgICAgICAgICAgY3RybC50YWJsZVN0YXRlKCkuc2VhcmNoID0ge307XG4gICAgICAgICAgICB0YWJsZUN0cmwuc2VhcmNoKGlucHV0LCBuZXdWYWx1ZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0+IHZpZXdcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY3RybC50YWJsZVN0YXRlKCkuc2VhcmNoO1xuICAgICAgICB9LCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XG4gICAgICAgICAgdmFyIHByZWRpY2F0ZUV4cHJlc3Npb24gPSBhdHRyLnN0U2VhcmNoIHx8ICckJztcbiAgICAgICAgICBpZiAobmV3VmFsdWUucHJlZGljYXRlT2JqZWN0ICYmIG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdFtwcmVkaWNhdGVFeHByZXNzaW9uXSAhPT0gZWxlbWVudFswXS52YWx1ZSkge1xuICAgICAgICAgICAgZWxlbWVudFswXS52YWx1ZSA9IG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdFtwcmVkaWNhdGVFeHByZXNzaW9uXSB8fCAnJztcbiAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIC8vIHZpZXcgLT4gdGFibGUgc3RhdGVcbiAgICAgICAgZWxlbWVudC5iaW5kKCdpbnB1dCcsIGZ1bmN0aW9uIChldnQpIHtcbiAgICAgICAgICBldnQgPSBldnQub3JpZ2luYWxFdmVudCB8fCBldnQ7XG4gICAgICAgICAgaWYgKHByb21pc2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbChwcm9taXNlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBwcm9taXNlID0gJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaChldnQudGFyZ2V0LnZhbHVlLCBhdHRyLnN0U2VhcmNoIHx8ICcnKTtcbiAgICAgICAgICAgIHByb21pc2UgPSBudWxsO1xuICAgICAgICAgIH0sIHRocm90dGxlKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0U2VsZWN0Um93JywgWydzdENvbmZpZycsIGZ1bmN0aW9uIChzdENvbmZpZykge1xuICAgIHJldHVybiB7XG4gICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcbiAgICAgIHNjb3BlOiB7XG4gICAgICAgIHJvdzogJz1zdFNlbGVjdFJvdydcbiAgICAgIH0sXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcbiAgICAgICAgdmFyIG1vZGUgPSBhdHRyLnN0U2VsZWN0TW9kZSB8fCBzdENvbmZpZy5zZWxlY3QubW9kZTtcbiAgICAgICAgZWxlbWVudC5iaW5kKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgY3RybC5zZWxlY3Qoc2NvcGUucm93LCBtb2RlKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgc2NvcGUuJHdhdGNoKCdyb3cuaXNTZWxlY3RlZCcsIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgZWxlbWVudC5hZGRDbGFzcyhzdENvbmZpZy5zZWxlY3Quc2VsZWN0ZWRDbGFzcyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3Moc3RDb25maWcuc2VsZWN0LnNlbGVjdGVkQ2xhc3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0U29ydCcsIFsnc3RDb25maWcnLCAnJHBhcnNlJywgZnVuY3Rpb24gKHN0Q29uZmlnLCAkcGFyc2UpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcblxuICAgICAgICB2YXIgcHJlZGljYXRlID0gYXR0ci5zdFNvcnQ7XG4gICAgICAgIHZhciBnZXR0ZXIgPSAkcGFyc2UocHJlZGljYXRlKTtcbiAgICAgICAgdmFyIGluZGV4ID0gMDtcbiAgICAgICAgdmFyIGNsYXNzQXNjZW50ID0gYXR0ci5zdENsYXNzQXNjZW50IHx8IHN0Q29uZmlnLnNvcnQuYXNjZW50Q2xhc3M7XG4gICAgICAgIHZhciBjbGFzc0Rlc2NlbnQgPSBhdHRyLnN0Q2xhc3NEZXNjZW50IHx8IHN0Q29uZmlnLnNvcnQuZGVzY2VudENsYXNzO1xuICAgICAgICB2YXIgc3RhdGVDbGFzc2VzID0gW2NsYXNzQXNjZW50LCBjbGFzc0Rlc2NlbnRdO1xuICAgICAgICB2YXIgc29ydERlZmF1bHQ7XG4gICAgICAgIHZhciBza2lwTmF0dXJhbCA9IGF0dHIuc3RTa2lwTmF0dXJhbCAhPT0gdW5kZWZpbmVkID8gYXR0ci5zdFNraXBOYXR1cmFsIDogc3RDb25maWcuc2tpcE5hdHVyYWw7XG5cbiAgICAgICAgaWYgKGF0dHIuc3RTb3J0RGVmYXVsdCkge1xuICAgICAgICAgIHNvcnREZWZhdWx0ID0gc2NvcGUuJGV2YWwoYXR0ci5zdFNvcnREZWZhdWx0KSAhPT0gdW5kZWZpbmVkID8gc2NvcGUuJGV2YWwoYXR0ci5zdFNvcnREZWZhdWx0KSA6IGF0dHIuc3RTb3J0RGVmYXVsdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLmNvbHVtbnMucHVzaChwcmVkaWNhdGUpO1xuXG4gICAgICAgIC8vdmlldyAtLT4gdGFibGUgc3RhdGVcbiAgICAgICAgZnVuY3Rpb24gc29ydCAoKSB7XG4gICAgICAgICAgaW5kZXgrKztcbiAgICAgICAgICBwcmVkaWNhdGUgPSBuZy5pc0Z1bmN0aW9uKGdldHRlcihzY29wZSkpID8gZ2V0dGVyKHNjb3BlKSA6IGF0dHIuc3RTb3J0O1xuICAgICAgICAgIGlmIChpbmRleCAlIDMgPT09IDAgJiYgISFza2lwTmF0dXJhbCAhPT0gdHJ1ZSkge1xuICAgICAgICAgICAgLy9tYW51YWwgcmVzZXRcbiAgICAgICAgICAgIGluZGV4ID0gMDtcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNvcnQgPSB7fTtcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xuICAgICAgICAgICAgY3RybC5waXBlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN0cmwuc29ydEJ5KHByZWRpY2F0ZSwgaW5kZXggJSAyID09PSAwKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBlbGVtZW50LmJpbmQoJ2NsaWNrJywgZnVuY3Rpb24gc29ydENsaWNrICgpIHtcbiAgICAgICAgICBpZiAocHJlZGljYXRlKSB7XG4gICAgICAgICAgICBzY29wZS4kYXBwbHkoc29ydCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBpZiAoc29ydERlZmF1bHQpIHtcbiAgICAgICAgICBpbmRleCA9IHNvcnREZWZhdWx0ID09PSAncmV2ZXJzZScgPyAxIDogMDtcbiAgICAgICAgICBzb3J0KCk7XG4gICAgICAgIH1cblxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0tPiB2aWV3XG4gICAgICAgIHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgcmV0dXJuIGN0cmwudGFibGVTdGF0ZSgpLnNvcnQ7XG4gICAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgIGlmIChuZXdWYWx1ZS5wcmVkaWNhdGUgIT09IHByZWRpY2F0ZSkge1xuICAgICAgICAgICAgaW5kZXggPSAwO1xuICAgICAgICAgICAgZWxlbWVudFxuICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3MoY2xhc3NBc2NlbnQpXG4gICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhjbGFzc0Rlc2NlbnQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbmRleCA9IG5ld1ZhbHVlLnJldmVyc2UgPT09IHRydWUgPyAyIDogMTtcbiAgICAgICAgICAgIGVsZW1lbnRcbiAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKHN0YXRlQ2xhc3Nlc1tpbmRleCAlIDJdKVxuICAgICAgICAgICAgICAuYWRkQ2xhc3Moc3RhdGVDbGFzc2VzW2luZGV4IC0gMV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXG4gIC5kaXJlY3RpdmUoJ3N0UGFnaW5hdGlvbicsIFsnc3RDb25maWcnLCBmdW5jdGlvbiAoc3RDb25maWcpIHtcbiAgICByZXR1cm4ge1xuICAgICAgcmVzdHJpY3Q6ICdFQScsXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxuICAgICAgc2NvcGU6IHtcbiAgICAgICAgc3RJdGVtc0J5UGFnZTogJz0/JyxcbiAgICAgICAgc3REaXNwbGF5ZWRQYWdlczogJz0/JyxcbiAgICAgICAgc3RQYWdlQ2hhbmdlOiAnJidcbiAgICAgIH0sXG4gICAgICB0ZW1wbGF0ZVVybDogZnVuY3Rpb24gKGVsZW1lbnQsIGF0dHJzKSB7XG4gICAgICAgIGlmIChhdHRycy5zdFRlbXBsYXRlKSB7XG4gICAgICAgICAgcmV0dXJuIGF0dHJzLnN0VGVtcGxhdGU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0Q29uZmlnLnBhZ2luYXRpb24udGVtcGxhdGU7XG4gICAgICB9LFxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycywgY3RybCkge1xuXG4gICAgICAgIHNjb3BlLnN0SXRlbXNCeVBhZ2UgPSBzY29wZS5zdEl0ZW1zQnlQYWdlID8gKyhzY29wZS5zdEl0ZW1zQnlQYWdlKSA6IHN0Q29uZmlnLnBhZ2luYXRpb24uaXRlbXNCeVBhZ2U7XG4gICAgICAgIHNjb3BlLnN0RGlzcGxheWVkUGFnZXMgPSBzY29wZS5zdERpc3BsYXllZFBhZ2VzID8gKyhzY29wZS5zdERpc3BsYXllZFBhZ2VzKSA6IHN0Q29uZmlnLnBhZ2luYXRpb24uZGlzcGxheWVkUGFnZXM7XG5cbiAgICAgICAgc2NvcGUuY3VycmVudFBhZ2UgPSAxO1xuICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xuXG4gICAgICAgIGZ1bmN0aW9uIHJlZHJhdyAoKSB7XG4gICAgICAgICAgdmFyIHBhZ2luYXRpb25TdGF0ZSA9IGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb247XG4gICAgICAgICAgdmFyIHN0YXJ0ID0gMTtcbiAgICAgICAgICB2YXIgZW5kO1xuICAgICAgICAgIHZhciBpO1xuICAgICAgICAgIHZhciBwcmV2UGFnZSA9IHNjb3BlLmN1cnJlbnRQYWdlO1xuICAgICAgICAgIHNjb3BlLmN1cnJlbnRQYWdlID0gTWF0aC5mbG9vcihwYWdpbmF0aW9uU3RhdGUuc3RhcnQgLyBwYWdpbmF0aW9uU3RhdGUubnVtYmVyKSArIDE7XG5cbiAgICAgICAgICBzdGFydCA9IE1hdGgubWF4KHN0YXJ0LCBzY29wZS5jdXJyZW50UGFnZSAtIE1hdGguYWJzKE1hdGguZmxvb3Ioc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyAvIDIpKSk7XG4gICAgICAgICAgZW5kID0gc3RhcnQgKyBzY29wZS5zdERpc3BsYXllZFBhZ2VzO1xuXG4gICAgICAgICAgaWYgKGVuZCA+IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzKSB7XG4gICAgICAgICAgICBlbmQgPSBwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcyArIDE7XG4gICAgICAgICAgICBzdGFydCA9IE1hdGgubWF4KDEsIGVuZCAtIHNjb3BlLnN0RGlzcGxheWVkUGFnZXMpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHNjb3BlLnBhZ2VzID0gW107XG4gICAgICAgICAgc2NvcGUubnVtUGFnZXMgPSBwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcztcblxuICAgICAgICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgICAgICAgIHNjb3BlLnBhZ2VzLnB1c2goaSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHByZXZQYWdlICE9PSBzY29wZS5jdXJyZW50UGFnZSkge1xuICAgICAgICAgICAgc2NvcGUuc3RQYWdlQ2hhbmdlKHtuZXdQYWdlOiBzY29wZS5jdXJyZW50UGFnZX0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vdGFibGUgc3RhdGUgLS0+IHZpZXdcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICByZXR1cm4gY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbjtcbiAgICAgICAgfSwgcmVkcmF3LCB0cnVlKTtcblxuICAgICAgICAvL3Njb3BlIC0tPiB0YWJsZSBzdGF0ZSAgKC0tPiB2aWV3KVxuICAgICAgICBzY29wZS4kd2F0Y2goJ3N0SXRlbXNCeVBhZ2UnLCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XG4gICAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSkge1xuICAgICAgICAgICAgc2NvcGUuc2VsZWN0UGFnZSgxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNjb3BlLiR3YXRjaCgnc3REaXNwbGF5ZWRQYWdlcycsIHJlZHJhdyk7XG5cbiAgICAgICAgLy92aWV3IC0+IHRhYmxlIHN0YXRlXG4gICAgICAgIHNjb3BlLnNlbGVjdFBhZ2UgPSBmdW5jdGlvbiAocGFnZSkge1xuICAgICAgICAgIGlmIChwYWdlID4gMCAmJiBwYWdlIDw9IHNjb3BlLm51bVBhZ2VzKSB7XG4gICAgICAgICAgICBjdHJsLnNsaWNlKChwYWdlIC0gMSkgKiBzY29wZS5zdEl0ZW1zQnlQYWdlLCBzY29wZS5zdEl0ZW1zQnlQYWdlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKCFjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uLm51bWJlcikge1xuICAgICAgICAgIGN0cmwuc2xpY2UoMCwgc2NvcGUuc3RJdGVtc0J5UGFnZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuICB9XSk7XG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcbiAgLmRpcmVjdGl2ZSgnc3RQaXBlJywgWydzdENvbmZpZycsICckdGltZW91dCcsIGZ1bmN0aW9uIChjb25maWcsICR0aW1lb3V0KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHJlcXVpcmU6ICdzdFRhYmxlJyxcbiAgICAgIHNjb3BlOiB7XG4gICAgICAgIHN0UGlwZTogJz0nXG4gICAgICB9LFxuICAgICAgbGluazoge1xuXG4gICAgICAgIHByZTogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycywgY3RybCkge1xuXG4gICAgICAgICAgdmFyIHBpcGVQcm9taXNlID0gbnVsbDtcblxuICAgICAgICAgIGlmIChuZy5pc0Z1bmN0aW9uKHNjb3BlLnN0UGlwZSkpIHtcbiAgICAgICAgICAgIGN0cmwucHJldmVudFBpcGVPbldhdGNoKCk7XG4gICAgICAgICAgICBjdHJsLnBpcGUgPSBmdW5jdGlvbiAoKSB7XG5cbiAgICAgICAgICAgICAgaWYgKHBpcGVQcm9taXNlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgJHRpbWVvdXQuY2FuY2VsKHBpcGVQcm9taXNlKVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgcGlwZVByb21pc2UgPSAkdGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgc2NvcGUuc3RQaXBlKGN0cmwudGFibGVTdGF0ZSgpLCBjdHJsKTtcbiAgICAgICAgICAgICAgfSwgY29uZmlnLnBpcGUuZGVsYXkpO1xuXG4gICAgICAgICAgICAgIHJldHVybiBwaXBlUHJvbWlzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9zdDogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycywgY3RybCkge1xuICAgICAgICAgIGN0cmwucGlwZSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgfV0pO1xuIiwifSkoYW5ndWxhcik7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9